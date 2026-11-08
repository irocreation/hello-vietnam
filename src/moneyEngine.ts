import { db, scopeFor, uid, type Identity } from "./data";
import { type MoneyRecord, type MoneyQueue, validMoney } from "./moneyTypes";
export interface MoneyRemote {
  verify(): Promise<Identity>;
  fetch(): Promise<MoneyRecord[]>;
  save(
    q: MoneyQueue,
  ): Promise<{ status: "ok" | "conflict"; record: MoneyRecord }>;
}
export type MoneyView = {
  records: MoneyRecord[];
  queueCount: number;
  status: "syncing" | "synced" | "offline" | "error";
  error: string;
  conflict?: { key: string; local: MoneyRecord; remote: MoneyRecord };
  loaded: boolean;
};
export class MoneyEngine {
  private closed = false;
  private listeners = new Set<() => void>();
  private running?: Promise<void>;
  private again = false;
  private scope: string;
  private view: MoneyView = {
    records: [],
    queueCount: 0,
    status: "syncing",
    error: "",
    loaded: false,
  };
  constructor(
    private identity: Identity,
    private remote: MoneyRemote,
    private online = () => navigator.onLine,
  ) {
    this.scope = scopeFor(identity);
    if (!this.online()) this.view.status = "offline";
  }
  getSnapshot = () => this.view;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  };
  get active() {
    return !this.closed;
  }
  resume() {
    this.closed = false;
  }
  fail() {
    this.emit({
      status: this.online() ? "error" : "offline",
      error: "おこづかい帳の保存領域を開けませんでした。",
    });
  }
  private emit(p: Partial<MoneyView> = {}) {
    if (this.closed) return;
    this.view = { ...this.view, ...p };
    this.listeners.forEach((f) => f());
  }
  async load() {
    const [saved, pending] = await Promise.all([
      db.money.where("scope").equals(this.scope).toArray(),
      db.moneyQueue.where("scope").equals(this.scope).toArray(),
    ]);
    const records = new Map(saved.map((c) => [c.key, c.record]));
    for (const p of pending) records.set(p.key, p.record);
    this.emit({
      records: [...records.values()],
      queueCount: pending.length,
      loaded: true,
    });
  }
  async save(record: MoneyRecord) {
    if (!validMoney(record))
      throw new Error("日付・金額・使いみちを確認してください。");
    const key = this.scope + ":" + record.kind + ":" + record.id;
    await db.transaction("rw", [db.money, db.moneyQueue], async () => {
      if (this.closed) throw new Error("ログインし直してください。");
      const pending = await db.moneyQueue.get(key);
      const cached = await db.money.get(key);
      await db.moneyQueue.put({
        key,
        scope: this.scope,
        record: { ...record },
        baseVersion: pending?.baseVersion ?? cached?.record.version ?? 0,
        mutationId: uid(),
      });
    });
    await this.load();
    void this.sync();
  }
  sync(): Promise<void> {
    if (this.closed || this.view.conflict) return Promise.resolve();
    if (!this.online()) {
      this.emit({ status: "offline" });
      return Promise.resolve();
    }
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.perform().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async perform() {
    do {
      this.again = false;
      this.emit({ status: "syncing", error: "" });
      try {
        const verified = await this.remote.verify();
        if (this.closed) return;
        if (
          verified.userId !== this.identity.userId ||
          verified.tripId !== this.identity.tripId
        )
          throw Error("identity");
        const fetched = await this.remote.fetch();
        if (!fetched.every(validMoney)) throw Error("data");
        if (this.closed) return;
        await db.transaction("rw", db.money, async () => {
          if (this.closed) return;
          await db.money.bulkPut(
            fetched.map((record) => ({
              key: this.scope + ":" + record.kind + ":" + record.id,
              scope: this.scope,
              record,
            })),
          );
        });
        await this.load();
        const pending = await db.moneyQueue
          .where("scope")
          .equals(this.scope)
          .toArray();
        for (const q of pending) {
          if (this.closed || !this.online()) break;
          const now = await db.moneyQueue.get(q.key);
          if (now?.mutationId !== q.mutationId) {
            this.again = true;
            continue;
          }
          const result = await this.remote.save(q);
          if (this.closed) return;
          if (!validMoney(result.record)) throw Error("data");
          await db.transaction("rw", [db.money, db.moneyQueue], async () => {
            if (this.closed) return;
            await db.money.put({
              key: q.key,
              scope: this.scope,
              record: result.record,
            });
            if (result.status === "ok") {
              const current = await db.moneyQueue.get(q.key);
              if (current?.mutationId === q.mutationId)
                await db.moneyQueue.delete(q.key);
              else if (current) {
                await db.moneyQueue.put({
                  ...current,
                  baseVersion: result.record.version,
                });
                this.again = true;
              }
            }
          });
          await this.load();
          if (result.status === "conflict") {
            this.emit({
              status: "error",
              error:
                "同じ記録が別の端末で更新されています。内容を確認してください。",
              conflict: { key: q.key, local: q.record, remote: result.record },
            });
            return;
          }
        }
        await this.load();
        if (this.view.queueCount) this.again = true;
        this.emit({
          status: this.online()
            ? this.view.queueCount
              ? "syncing"
              : "synced"
            : "offline",
          error: "",
        });
      } catch {
        this.emit({
          status: this.online() ? "error" : "offline",
          error:
            "おこづかい帳を同期できませんでした。未送信の記録は端末に保持しています。",
        });
        return;
      }
    } while (
      this.again &&
      !this.closed &&
      this.online() &&
      !this.view.conflict
    );
  }
  network() {
    if (!this.online()) this.emit({ status: "offline" });
    else void this.sync();
  }
  retry() {
    this.emit({ conflict: undefined, error: "" });
    return this.sync();
  }
  async resolve(local: boolean) {
    const c = this.view.conflict;
    if (!c) return;
    await db.transaction("rw", db.moneyQueue, async () => {
      const q = await db.moneyQueue.get(c.key);
      if (!q) return;
      if (local)
        await db.moneyQueue.put({
          ...q,
          baseVersion: c.remote.version,
          mutationId: uid(),
        });
      else await db.moneyQueue.delete(c.key);
    });
    await this.load();
    this.emit({ conflict: undefined, error: "" });
    await this.sync();
  }
  dispose() {
    this.closed = true;
    this.listeners.clear();
  }
}

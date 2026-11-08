import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db, scopeFor, type Identity } from "../src/data";
import { MoneyEngine, type MoneyRemote } from "../src/moneyEngine";
import {
  parseDong,
  vietnamToday,
  validDate,
  totalForDay,
  yen,
  type MoneyRecord,
  type MoneyQueue,
} from "../src/moneyTypes";
const identity: Identity = {
  userId: "viewer",
  tripId: "trip",
  role: "viewer",
  email: "test@example.invalid",
  tripName: "TEST",
  startDate: "2030-01-01",
  endDate: "2030-01-05",
};
const expense = (id = crypto.randomUUID()): MoneyRecord => ({
  id,
  kind: "expense",
  date: "2030-01-01",
  amount: 100000,
  name: "TEST meal",
  category: "食事",
  memo: "",
  deleted: false,
  version: 0,
  last_mutation: null,
});
class Remote implements MoneyRemote {
  records = new Map<string, MoneyRecord>();
  fail = false;
  async verify() {
    if (this.fail) throw Error("network");
    return identity;
  }
  async fetch() {
    if (this.fail) throw Error("network");
    return [...this.records.values()].map((r) => structuredClone(r));
  }
  async save(q: MoneyQueue) {
    if (this.fail) throw Error("network");
    const old = this.records.get(q.record.kind + ":" + q.record.id);
    if (old?.last_mutation === q.mutationId)
      return { status: "ok" as const, record: old };
    if ((old?.version ?? 0) !== q.baseVersion)
      return { status: "conflict" as const, record: old! };
    const record = {
      ...q.record,
      version: (old?.version ?? 0) + 1,
      last_mutation: q.mutationId,
    };
    this.records.set(record.kind + ":" + record.id, record);
    return { status: "ok" as const, record };
  }
}
async function reset() {
  await db.money.clear();
  await db.moneyQueue.clear();
}
test("Vietnam day boundary, localized amounts, and yen calculation", () => {
  assert.equal(
    vietnamToday(Date.parse("2030-01-01T01:00:00+09:00")),
    "2029-12-31",
  );
  assert.equal(parseDong("１００，０００"), 100000);
  assert.equal(parseDong("100.000"), 100000);
  assert.equal(parseDong("100.50"), null);
  assert.equal(parseDong("-1"), null);
  assert.equal(validDate("2030-02-30"), false);
  assert.equal(
    yen(100000, {
      yenPerDong: 0.006,
      date: "2030-01-01",
      fetchedAt: "2030-01-01T00:00:00Z",
      source: "manual",
    }),
    "￥600",
  );
});
test("daily totals exclude another date, daily memo and hidden expenses", () => {
  const a = expense(),
    b = { ...expense(), amount: 50000 },
    hidden = { ...expense(), deleted: true },
    other = { ...expense(), date: "2030-01-02" },
    memo = { ...expense("2030-01-01"), kind: "day" as const, amount: 0 };
  assert.equal(totalForDay([a, b, hidden, other, memo], "2030-01-01"), 150000);
});
test("offline expense and daily memo survive restart; failed sync keeps queue", async () => {
  await reset();
  let online = false;
  const remote = new Remote();
  const e = new MoneyEngine(identity, remote, () => online);
  await e.load();
  await e.save(expense());
  await e.save({
    ...expense("2030-01-01"),
    kind: "day",
    amount: 0,
    memo: "TEST another person paid",
  });
  assert.equal(e.getSnapshot().queueCount, 2);
  e.dispose();
  const resumed = new MoneyEngine(identity, remote, () => online);
  await resumed.load();
  assert.equal(
    totalForDay(resumed.getSnapshot().records, "2030-01-01"),
    100000,
  );
  assert.equal(
    resumed.getSnapshot().records.find((r) => r.kind === "day")?.memo,
    "TEST another person paid",
  );
  online = true;
  remote.fail = true;
  await resumed.sync();
  assert.equal(resumed.getSnapshot().queueCount, 2);
  remote.fail = false;
  await resumed.retry();
  assert.equal(resumed.getSnapshot().queueCount, 0);
  assert.equal(remote.records.size, 2);
  resumed.dispose();
});
test("separate user cache scopes and reversible removal", async () => {
  await reset();
  const remote = new Remote();
  const e = new MoneyEngine(identity, remote, () => true);
  await e.load();
  const r = expense();
  await e.save(r);
  await e.sync();
  await e.save({ ...r, deleted: true });
  await e.sync();
  assert.equal(totalForDay(e.getSnapshot().records, r.date), 0);
  await e.save({ ...r, deleted: false });
  await e.sync();
  assert.equal(totalForDay(e.getSnapshot().records, r.date), 100000);
  const other = new MoneyEngine(
    { ...identity, userId: "other" },
    remote,
    () => false,
  );
  await other.load();
  assert.equal(other.getSnapshot().records.length, 0);
  assert.notEqual(
    scopeFor(identity),
    scopeFor({ ...identity, userId: "other" }),
  );
  e.dispose();
  other.dispose();
});
test("conflicts require a choice and do not overwrite another device", async () => {
  await reset();
  let online = true;
  const remote = new Remote();
  const e = new MoneyEngine(identity, remote, () => online);
  await e.load();
  const r = expense();
  await e.save(r);
  await e.sync();
  online = false;
  await e.save({ ...r, amount: 200000 });
  remote.records.set("expense:" + r.id, {
    ...r,
    amount: 300000,
    version: 2,
    last_mutation: "other",
  });
  online = true;
  await e.sync();
  assert.equal(e.getSnapshot().conflict?.remote.amount, 300000);
  assert.equal(e.getSnapshot().queueCount, 1);
  assert.equal(remote.records.get("expense:" + r.id)?.amount, 300000);
  await e.resolve(true);
  assert.equal(remote.records.get("expense:" + r.id)?.amount, 200000);
  assert.equal(e.getSnapshot().queueCount, 0);
  e.dispose();
});
test("logout disposal blocks in-flight cache restoration", async () => {
  await reset();
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => (release = resolve));
  const remote = new Remote();
  remote.records.set("expense:test", expense());
  const original = remote.fetch.bind(remote);
  remote.fetch = async () => {
    await pending;
    return original();
  };
  const e = new MoneyEngine(identity, remote, () => true);
  await e.load();
  const sync = e.sync();
  await new Promise((resolve) => setTimeout(resolve, 0));
  e.dispose();
  await reset();
  release();
  await sync;
  assert.equal(await db.money.count(), 0);
  assert.equal(await db.moneyQueue.count(), 0);
});

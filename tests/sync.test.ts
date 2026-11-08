import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  db,
  emptyState,
  materialize,
  scopeFor,
  type Identity,
  type Document,
  type CheckRecord,
  type QueueItem,
  type SharedState,
} from "../src/data";
import { SyncEngine, type Remote, type SaveResult } from "../src/sync";
const admin: Identity = {
  userId: "admin",
  tripId: "trip",
  role: "admin",
  email: "test@example.invalid",
  tripName: "TEST",
  startDate: "2030-01-01",
  endDate: "2030-01-05",
};
class FakeRemote implements Remote {
  document: Document = {
    payload: {
      ...emptyState(),
      packing: [{ id: "item", name: "Test", category: "必需品", quantity: 1 }],
    },
    version: 1,
    last_mutation: null,
  };
  checks = new Map<string, CheckRecord[]>();
  role: Identity["role"] = "admin";
  fail = false;
  constructor(public identity = admin) {}
  async verify() {
    if (this.fail) throw Error("auth");
    return { ...this.identity, role: this.role };
  }
  async fetch() {
    if (this.fail) throw Error("network");
    return {
      document: structuredClone(this.document),
      checks: structuredClone(this.checks.get(this.identity.userId) ?? []),
    };
  }
  async saveDocument(q: QueueItem): Promise<SaveResult> {
    if (this.fail || this.role !== "admin") throw Error("forbidden");
    if (this.document.last_mutation === q.mutationId)
      return { status: "ok", document: structuredClone(this.document) };
    if (q.baseVersion !== this.document.version)
      return { status: "conflict", document: structuredClone(this.document) };
    this.document = {
      payload: structuredClone(q.payload as SharedState),
      version: this.document.version + 1,
      last_mutation: q.mutationId,
    };
    return { status: "ok", document: structuredClone(this.document) };
  }
  async saveCheck(q: QueueItem): Promise<SaveResult> {
    if (this.fail) throw Error("network");
    const rows = this.checks.get(this.identity.userId) ?? [];
    const c = rows.find((c) => c.item_id === q.itemId);
    if (c?.last_mutation === q.mutationId) return { status: "ok", check: c };
    if ((c?.version ?? 0) !== q.baseVersion)
      return { status: "conflict", check: c };
    const next = {
      item_id: q.itemId!,
      checked: q.payload as boolean,
      version: (c?.version ?? 0) + 1,
      last_mutation: q.mutationId,
    };
    this.checks.set(this.identity.userId, [
      ...rows.filter((c) => c.item_id !== q.itemId),
      next,
    ]);
    return { status: "ok", check: next };
  }
}
async function reset() {
  await db.snapshots.clear();
  await db.queue.clear();
  await db.meta.clear();
}
test("offline queue survives restart, failed sync retained, reconnect sends", async () => {
  await reset();
  let online = true;
  const remote = new FakeRemote();
  const first = new SyncEngine(admin, remote, () => online);
  await first.load();
  await first.sync();
  online = false;
  const data = first.getSnapshot().data!;
  await first.edit({
    ...data,
    notes: [
      {
        id: "n",
        name: "Offline note",
        category: "その他メモ",
        memo: "saved offline",
        url: "",
      },
    ],
  });
  await first.check("item", true);
  assert.equal(first.getSnapshot().queueCount, 2);
  first.dispose();
  const restarted = new SyncEngine(admin, remote, () => online);
  await restarted.load();
  assert.equal(restarted.getSnapshot().data!.notes[0].memo, "saved offline");
  assert.equal(restarted.getSnapshot().data!.packing[0].done, true);
  online = true;
  remote.fail = true;
  await restarted.sync();
  assert.equal(restarted.getSnapshot().queueCount, 2);
  assert.equal(restarted.getSnapshot().status, "error");
  remote.fail = false;
  await restarted.retry();
  assert.equal(restarted.getSnapshot().queueCount, 0);
  assert.equal(remote.document.payload.notes[0].name, "Offline note");
  assert.equal(remote.checks.get(admin.userId)![0].checked, true);
  restarted.dispose();
});
test("shared conflict preserved, explicit local resolution rebases CAS", async () => {
  await reset();
  let online = true;
  const remote = new FakeRemote();
  const engine = new SyncEngine(admin, remote, () => online);
  await engine.load();
  await engine.sync();
  online = false;
  await engine.edit({
    ...engine.getSnapshot().data!,
    notes: [
      { id: "local", name: "local", category: "その他メモ", memo: "", url: "" },
    ],
  });
  remote.document = {
    payload: {
      ...remote.document.payload,
      notes: [
        {
          id: "server",
          name: "server",
          category: "その他メモ",
          memo: "",
          url: "",
        },
      ],
    },
    version: 2,
    last_mutation: "other",
  };
  online = true;
  await engine.sync();
  assert.equal(engine.getSnapshot().conflict?.kind, "shared");
  assert.equal(engine.getSnapshot().queueCount, 1);
  assert.equal(remote.document.payload.notes[0].id, "server");
  await engine.resolve("local");
  assert.equal(remote.document.payload.notes[0].id, "local");
  assert.equal(engine.getSnapshot().queueCount, 0);
  engine.dispose();
});
test("viewer cannot edit shared data, checks independent and scoped by user", async () => {
  await reset();
  const remote = new FakeRemote();
  const a = new SyncEngine(admin, remote, () => true);
  await a.load();
  await a.sync();
  await a.check("item", true);
  await a.sync();
  const viewer = { ...admin, userId: "viewer", role: "viewer" as const };
  const vr = new FakeRemote(viewer);
  vr.role = "viewer";
  vr.document = remote.document;
  vr.checks = remote.checks;
  const v = new SyncEngine(viewer, vr, () => true);
  await v.load();
  await v.sync();
  assert.equal(v.getSnapshot().data!.packing[0].done, false);
  await assert.rejects(v.edit(v.getSnapshot().data!), /管理者/);
  await v.check("item", false);
  await v.sync();
  assert.equal(remote.checks.get(admin.userId)![0].checked, true);
  assert.equal(vr.checks.get(viewer.userId)![0].checked, false);
  assert.notEqual(scopeFor(admin), scopeFor(viewer));
  a.dispose();
  v.dispose();
});
test("demoted admin cannot upload offline edits; queue retained", async () => {
  await reset();
  let online = true;
  const remote = new FakeRemote();
  const e = new SyncEngine(admin, remote, () => online);
  await e.load();
  await e.sync();
  online = false;
  await e.edit({
    ...e.getSnapshot().data!,
    notes: [
      { id: "n", name: "keep", category: "その他メモ", memo: "", url: "" },
    ],
  });
  remote.role = "viewer";
  online = true;
  await e.sync();
  assert.equal(e.getSnapshot().identity.role, "viewer");
  assert.equal(e.getSnapshot().queueCount, 1);
  assert.equal(remote.document.payload.notes.length, 0);
  e.dispose();
});
test("check conflict can adopt server without losing shared data", async () => {
  await reset();
  let online = true;
  const remote = new FakeRemote();
  const e = new SyncEngine(admin, remote, () => online);
  await e.load();
  await e.sync();
  online = false;
  await e.check("item", true);
  remote.checks.set(admin.userId, [
    { item_id: "item", checked: false, version: 1, last_mutation: "other" },
  ]);
  online = true;
  await e.sync();
  assert.equal(e.getSnapshot().conflict?.kind, "check");
  await e.resolve("remote");
  assert.equal(e.getSnapshot().data!.packing[0].done, false);
  assert.equal(e.getSnapshot().queueCount, 0);
  e.dispose();
});
test("HTTPS-only links and user check exclusion validated before enqueue", async () => {
  await reset();
  const remote = new FakeRemote();
  const e = new SyncEngine(admin, remote, () => false);
  await db.snapshots.put({
    scope: scopeFor(admin),
    identity: admin,
    document: remote.document,
    checks: [],
    lastSync: null,
  });
  await e.load();
  const data = materialize(remote.document.payload, []);
  await assert.rejects(
    e.edit({
      ...data,
      notes: [
        {
          id: "n",
          name: "unsafe",
          category: "その他メモ",
          memo: "",
          url: "javascript:alert(1)",
        },
      ],
    }),
    /形式/,
  );
  await e.edit(data);
  const q = await db.queue.toArray();
  assert.equal("done" in (q[0].payload as SharedState).packing[0], false);
  e.dispose();
});

test('logout disposal prevents an in-flight fetch from restoring the cache',async()=>{
 await reset();let release:()=>void=()=>{};const waiting=new Promise<void>(resolve=>{release=resolve});const remote=new FakeRemote();const fetchOriginal=remote.fetch.bind(remote);remote.fetch=async()=>{await waiting;return fetchOriginal()};const e=new SyncEngine(admin,remote,()=>true);await e.load();const syncing=e.sync();await new Promise(resolve=>setTimeout(resolve,0));e.dispose();await db.snapshots.clear();await db.queue.clear();release();await syncing;assert.equal(e.active,false);assert.equal(await db.snapshots.count(),0);assert.equal(await db.queue.count(),0);
});

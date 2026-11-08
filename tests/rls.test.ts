import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  viewer: "00000000-0000-4000-8000-000000000002",
  outsider: "00000000-0000-4000-8000-000000000003",
  trip: "10000000-0000-4000-8000-000000000001",
};
const payload = {
  events: [],
  packing: [
    { id: "umbrella", name: "TEST umbrella", category: "必需品", quantity: 1 },
  ],
  places: [],
  flights: [],
  hotels: [],
  notes: [],
};
test("PostgreSQL: RLS, two-member roles, independent checks, CAS and idempotency", async (t) => {
  const pg = new PGlite();
  await pg.waitReady;
  await pg.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  await pg.exec(
    await readFile(
      new URL("../supabase/migrations/001_private_trip.sql", import.meta.url),
      "utf8",
    ),
  );
  await pg.query("insert into auth.users(id) values($1),($2),($3)", [
    ids.admin,
    ids.viewer,
    ids.outsider,
  ]);
  await pg.query(
    "insert into public.travel_groups(id,name,start_date,end_date) values($1,'TEST TRIP','2030-01-01','2030-01-05')",
    [ids.trip],
  );
  await pg.query(
    "insert into public.group_members(trip_id,user_id,role) values($1,$2,'admin'),($1,$3,'viewer')",
    [ids.trip, ids.admin, ids.viewer],
  );
  const as = async (user: string | null, fn: () => Promise<void>) => {
    await pg.exec(
      user
        ? `set role authenticated;select set_config('request.jwt.claim.sub','${user}',false)`
        : "set role anon",
    );
    try {
      await fn();
    } finally {
      await pg.exec("reset role");
    }
  };
  const save = async (
    version: number,
    data = payload,
    mutation = crypto.randomUUID(),
  ) =>
    (
      await pg.query<any>(
        "select public.save_trip_document($1,$2,$3::jsonb,$4) as result",
        [ids.trip, version, JSON.stringify(data), mutation],
      )
    ).rows[0].result;
  const check = async (
    version: number,
    done: boolean,
    mutation = crypto.randomUUID(),
  ) =>
    (
      await pg.query<any>(
        "select public.save_packing_check($1,'umbrella',$2,$3,$4) as result",
        [ids.trip, version, done, mutation],
      )
    ).rows[0].result;
  await t.test("admin can create shared data", () =>
    as(ids.admin, async () => {
      const r = await save(0);
      assert.equal(r.status, "ok");
      assert.equal(r.document.version, 1);
    }),
  );
  await t.test("anonymous cannot select private documents", () =>
    as(null, async () => {
      await assert.rejects(
        pg.query("select * from public.travel_documents"),
        /permission denied/,
      );
    }),
  );
  await t.test("outsider reads zero rows and cannot write", () =>
    as(ids.outsider, async () => {
      assert.equal(
        (await pg.query("select * from public.travel_documents")).rows.length,
        0,
      );
      await assert.rejects(save(1), /forbidden/);
    }),
  );
  await t.test(
    "viewer reads shared data, direct writes and RPC writes denied",
    () =>
      as(ids.viewer, async () => {
        assert.equal(
          (await pg.query("select * from public.travel_documents")).rows.length,
          1,
        );
        assert.equal(
          (
            await pg.query(
              "update public.travel_documents set version=version+1 returning trip_id",
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await pg.query(
              "delete from public.travel_documents returning trip_id",
            )
          ).rows.length,
          0,
        );
        await assert.rejects(save(1), /forbidden/);
        await assert.rejects(
          pg.query(
            "update public.group_members set role='admin' where user_id=$1",
            [ids.viewer],
          ),
          /permission denied/,
        );
        await assert.rejects(
          pg.query(
            "insert into public.travel_documents(trip_id,payload) values($1,$2::jsonb)",
            [ids.trip, JSON.stringify(payload)],
          ),
          /row-level security/,
        );
      }),
  );
  await t.test(
    "viewer can save own check; admin cannot read or update it",
    async () => {
      await as(ids.viewer, async () => {
        const c = await check(0, true);
        assert.equal(c.status, "ok");
        assert.equal(c.check.user_id, ids.viewer);
      });
      await as(ids.admin, async () => {
        assert.equal(
          (await pg.query("select * from public.packing_checks")).rows.length,
          0,
        );
        assert.equal(
          (
            await pg.query(
              "update public.packing_checks set checked=false where user_id=$1 returning item_id",
              [ids.viewer],
            )
          ).rows.length,
          0,
        );
        const c = await check(0, false);
        assert.equal(c.check.checked, false);
      });
      await as(ids.viewer, async () => {
        assert.equal(
          (await pg.query<any>("select checked from public.packing_checks"))
            .rows[0].checked,
          true,
        );
        await assert.rejects(
          pg.query(
            "insert into public.packing_checks(trip_id,user_id,item_id,checked) values($1,$2,$3,true)",
            [ids.trip, ids.admin, "umbrella"],
          ),
          /row-level security/,
        );
      });
    },
  );
  await t.test(
    "shared CAS prevents stale overwrites and retry is idempotent",
    () =>
      as(ids.admin, async () => {
        const mid = crypto.randomUUID();
        const r = await save(1, payload, mid);
        assert.equal(r.document.version, 2);
        assert.equal((await save(1, payload, mid)).document.version, 2);
        const stale = await save(1);
        assert.equal(stale.status, "conflict");
        assert.equal(stale.document.version, 2);
        assert.equal((await save(2)).document.version, 3);
      }),
  );
  await t.test("check conflicts are also detected and retries idempotent", () =>
    as(ids.viewer, async () => {
      const mid = crypto.randomUUID();
      const a = await check(1, false, mid);
      assert.equal(a.check.version, 2);
      assert.equal((await check(1, false, mid)).check.version, 2);
      assert.equal((await check(1, true)).status, "conflict");
    }),
  );
  await t.test("unsafe URL and shared packing check status rejected", () =>
    as(ids.admin, async () => {
      await assert.rejects(
        save(3, {
          ...payload,
          packing: [{ ...payload.packing[0], done: true }],
        } as any),
        /invalid payload/,
      );
      await assert.rejects(
        save(3, {
          ...payload,
          notes: [
            {
              id: "x",
              name: "unsafe",
              category: "other",
              memo: "",
              url: "javascript:alert(1)",
            },
          ],
        } as any),
        /invalid payload/,
      );
    }),
  );
  await t.test("third member and client self-enrollment rejected", async () => {
    await assert.rejects(
      pg.query(
        "insert into public.group_members(trip_id,user_id,role) values($1,$2,'viewer')",
        [ids.trip, ids.outsider],
      ),
      /unique constraint/,
    );
    await as(ids.outsider, async () => {
      await assert.rejects(
        pg.query(
          "insert into public.group_members(trip_id,user_id,role) values($1,$2,'viewer')",
          [ids.trip, ids.outsider],
        ),
        /permission denied/,
      );
    });
  });
  await pg.exec(
    `create schema storage;create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  await pg.exec(
    await readFile(
      new URL("../supabase/migrations/002_place_photos.sql", import.meta.url),
      "utf8",
    ),
  );
  const photoName = ids.trip + "/p1/20000000-0000-4000-8000-000000000001.jpg";
  await t.test(
    "private photos: admin uploads, viewer reads, outsider and anonymous denied",
    async () => {
      await as(ids.admin, async () => {
        await pg.query(
          "insert into storage.objects(bucket_id,name) values($1,$2)",
          ["place-photos", photoName],
        );
      });
      await as(ids.viewer, async () => {
        assert.equal(
          (await pg.query("select * from storage.objects")).rows.length,
          1,
        );
        await assert.rejects(
          pg.query(
            "insert into storage.objects(bucket_id,name) values($1,$2)",
            ["place-photos", photoName],
          ),
          /row-level security/,
        );
        assert.equal(
          (await pg.query("delete from storage.objects returning id")).rows
            .length,
          0,
        );
      });
      await as(ids.outsider, async () => {
        assert.equal(
          (await pg.query("select * from storage.objects")).rows.length,
          0,
        );
        await assert.rejects(
          pg.query(
            "insert into storage.objects(bucket_id,name) values($1,$2)",
            ["place-photos", photoName],
          ),
          /row-level security/,
        );
      });
      await as(null, async () => {
        await assert.rejects(
          pg.query("select * from storage.objects"),
          /permission denied/,
        );
      });
    },
  );
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/003_personal_spending.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const expenseId = "30000000-0000-4000-8000-000000000001";
  const values = {
    date: "2030-01-01",
    amount: 100000,
    name: "TEST meal",
    category: "食事",
    memo: "",
    deleted: false,
  };
  const saveMoney = async (
    kind: string,
    id: string,
    version: number,
    payload: any = values,
    mutation = crypto.randomUUID(),
  ) =>
    (
      await pg.query<any>(
        "select public.save_money_record($1,auth.uid(),$2,$3,$4,$5::jsonb,$6) as result",
        [ids.trip, kind, id, version, JSON.stringify(payload), mutation],
      )
    ).rows[0].result;
  await t.test(
    "spending: both roles can write only their own records; no cross-user access",
    async () => {
      await as(ids.admin, async () => {
        assert.equal((await saveMoney("expense", expenseId, 0)).status, "ok");
      });
      await as(ids.viewer, async () => {
        assert.equal(
          (await pg.query("select * from public.money_records")).rows.length,
          0,
        );
        await saveMoney("expense", expenseId, 0, { ...values, amount: 50000 });
        assert.equal(
          (await pg.query<any>("select amount_vnd from public.money_records"))
            .rows[0].amount_vnd,
          50000,
        );
        assert.equal(
          (
            await pg.query(
              "update public.money_records set amount_vnd=1 where user_id=$1 returning id",
              [ids.admin],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          pg.query("delete from public.money_records"),
          /permission denied/,
        );
      });
      await as(ids.admin, async () => {
        assert.equal(
          (await pg.query<any>("select amount_vnd from public.money_records"))
            .rows[0].amount_vnd,
          100000,
        );
      });
      await as(ids.outsider, async () => {
        assert.equal(
          (await pg.query("select * from public.money_records")).rows.length,
          0,
        );
        await assert.rejects(saveMoney("expense", expenseId, 0), /forbidden/);
      });
      await as(null, async () => {
        await assert.rejects(
          pg.query("select * from public.money_records"),
          /permission denied/,
        );
      });
    },
  );
  await t.test(
    "spending CAS, reversible hiding, and private daily notes",
    async () => {
      await as(ids.viewer, async () => {
        const mutation = crypto.randomUUID();
        const first = await saveMoney(
          "expense",
          expenseId,
          1,
          { ...values, amount: 50000, deleted: true },
          mutation,
        );
        assert.equal(first.record.deleted, true);
        assert.equal(
          (
            await saveMoney(
              "expense",
              expenseId,
              1,
              { ...values, amount: 50000, deleted: true },
              mutation,
            )
          ).record.version,
          2,
        );
        assert.equal(
          (await saveMoney("expense", expenseId, 1)).status,
          "conflict",
        );
        await saveMoney("expense", expenseId, 2, { ...values, amount: 50000 });
        assert.equal(
          (
            await saveMoney("day", "2030-01-01", 0, {
              ...values,
              amount: 0,
              memo: "TEST daily memo",
            })
          ).status,
          "ok",
        );
        await assert.rejects(
          saveMoney("expense", crypto.randomUUID(), 0, {
            ...values,
            amount: -1,
          }),
          /check constraint/,
        );
      });
      await as(ids.admin, async () => {
        assert.equal(
          (
            await pg.query(
              "select * from public.money_records where kind='day'",
            )
          ).rows.length,
          0,
        );
      });
    },
  );
  await pg.close();
});

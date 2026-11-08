import { supabase, verifiedIdentity } from "./supabase";
import type { Identity } from "./data";
import type { MoneyRemote } from "./moneyEngine";
import type { MoneyRecord } from "./moneyTypes";
export function decodeMoney(row: any): MoneyRecord {
  return {
    id: row.id,
    kind: row.kind,
    date: row.entry_date,
    amount: Number(row.amount_vnd),
    name: row.title,
    category: row.category,
    memo: row.memo,
    deleted: row.deleted,
    version: Number(row.version),
    last_mutation: row.last_mutation,
  };
}
export function moneyRemote(identity: Identity): MoneyRemote {
  return {
    verify: verifiedIdentity,
    async fetch() {
      const { data, error } = await supabase!
        .from("money_records")
        .select(
          "id,kind,entry_date,amount_vnd,title,category,memo,deleted,version,last_mutation",
        )
        .eq("trip_id", identity.tripId)
        .eq("user_id", identity.userId);
      if (error) throw Error("fetch");
      return (data ?? []).map(decodeMoney);
    },
    async save(q) {
      const { data, error } = await supabase!.rpc("save_money_record", {
        p_trip: identity.tripId,
        p_user: identity.userId,
        p_kind: q.record.kind,
        p_id: q.record.id,
        p_expected_version: q.baseVersion,
        p_values: q.record,
        p_mutation: q.mutationId,
      });
      if (error) throw Error("save");
      return { status: data.status, record: decodeMoney(data.record) };
    },
  };
}

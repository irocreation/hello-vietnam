import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  emptyState,
  type Identity,
  type Document,
  type CheckRecord,
  type QueueItem,
} from "./data";
import type { Remote, SaveResult } from "./sync";
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
function publicKey(k: string) {
  if (k.startsWith("sb_publishable_")) return true;
  try {
    return (
      JSON.parse(atob(k.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
        .role === "anon"
    );
  } catch {
    return false;
  }
}
export const configured =
  /^https:\/\//.test(url) &&
  !url.includes("YOUR_PROJECT") &&
  publicKey(key) &&
  !key.includes("YOUR_PUBLIC_KEY");
const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(15000) });
export const supabase: SupabaseClient | null = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: navigator.onLine,
        detectSessionInUrl: false,
        storageKey: "hello-vietnam-auth-v2",
      },
      global: { fetch: fetchWithTimeout },
    })
  : null;
export async function verifiedIdentity(): Promise<Identity> {
  if (!supabase) throw new Error("Supabaseが設定されていません。");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("認証が必要です。");
  const { data, error: memberError } = await supabase
    .from("group_members")
    .select("trip_id,role,travel_groups(name,start_date,end_date)")
    .eq("user_id", user.id)
    .single();
  if (memberError || !data || !["admin", "viewer"].includes(data.role))
    throw new Error("旅行グループへの所属がありません。");
  const group = Array.isArray(data.travel_groups)
    ? data.travel_groups[0]
    : data.travel_groups;
  if (!group) throw new Error("旅行グループが見つかりません。");
  return {
    userId: user.id,
    tripId: data.trip_id,
    role: data.role,
    email: user.email ?? "",
    tripName: group.name,
    startDate: group.start_date,
    endDate: group.end_date,
  };
}
export function createRemote(identity: Identity): Remote {
  const client = supabase!;
  return {
    verify: verifiedIdentity,
    async fetch() {
      const [d, c] = await Promise.all([
        client
          .from("travel_documents")
          .select("payload,version,last_mutation")
          .eq("trip_id", identity.tripId)
          .maybeSingle(),
        client
          .from("packing_checks")
          .select("item_id,checked,version,last_mutation")
          .eq("trip_id", identity.tripId)
          .eq("user_id", identity.userId),
      ]);
      if (d.error || c.error) throw new Error("fetch");
      return {
        document: (d.data as Document | null) ?? {
          payload: emptyState(),
          version: 0,
          last_mutation: null,
        },
        checks: (c.data ?? []) as CheckRecord[],
      };
    },
    async saveDocument(q: QueueItem) {
      const { data, error } = await client.rpc("save_trip_document", {
        p_trip: identity.tripId,
        p_expected_version: q.baseVersion,
        p_payload: q.payload,
        p_mutation: q.mutationId,
      });
      if (error) throw new Error("save");
      return data as SaveResult;
    },
    async saveCheck(q: QueueItem) {
      const { data, error } = await client.rpc("save_packing_check", {
        p_trip: identity.tripId,
        p_item: q.itemId,
        p_expected_version: q.baseVersion,
        p_checked: q.payload,
        p_mutation: q.mutationId,
      });
      if (error) throw new Error("check");
      return data as SaveResult;
    },
  };
}

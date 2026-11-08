import Dexie, { type EntityTable } from "dexie";
export const categories = [
  "Flight",
  "Hotel",
  "Food",
  "Cafe",
  "Sightseeing",
  "Shopping",
  "Transport",
  "Other",
];
export const packingCategories = [
  "必需品",
  "衣類",
  "美容・スキンケア",
  "薬・衛生用品",
  "電子機器",
  "雨・暑さ対策",
  "機内持ち込み",
  "出発前のToDo",
];
export const cities = ["ホーチミン", "ホイアン", "ダナン"];
export type Event = {
  id: string;
  date: string;
  time: string;
  end: string;
  name: string;
  category: string;
  place: string;
  mapUrl: string;
  memo: string;
  url: string;
  done: boolean;
  flightId?: string;
  order: number;
};
export type Pack = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  done: boolean;
};
export type Place = {
  id: string;
  name: string;
  city: string;
  category: string;
  address: string;
  memo: string;
  url: string;
  lat: string;
  lng: string;
  visited: boolean;
  favorite: boolean;
};
export type Flight = {
  id: string;
  airline: string;
  number: string;
  departure: string;
  arrival: string;
  from: string;
  to: string;
  booking: string;
  url: string;
  checked: string;
  cabin: string;
  memo: string;
};
export type HotelRecord = {
  id: string;
  name: string;
  city: string;
  checkin: string;
  checkout: string;
  address: string;
  mapUrl: string;
  url: string;
  booking: string;
  phone: string;
  memo: string;
};
export type Note = {
  id: string;
  name: string;
  category: string;
  memo: string;
  url: string;
};
export type State = {
  events: Event[];
  packing: Pack[];
  places: Place[];
  flights: Flight[];
  hotels: HotelRecord[];
  notes: Note[];
};
export type SharedState = Omit<State, "packing"> & {
  packing: Omit<Pack, "done">[];
};
export type Identity = {
  userId: string;
  tripId: string;
  role: "admin" | "viewer";
  email: string;
  tripName: string;
  startDate: string;
  endDate: string;
};
export type Document = {
  payload: SharedState;
  version: number;
  last_mutation: string | null;
};
export type CheckRecord = {
  item_id: string;
  checked: boolean;
  version: number;
  last_mutation: string | null;
};
export type Snapshot = {
  scope: string;
  identity: Identity;
  document: Document;
  checks: CheckRecord[];
  lastSync: string | null;
};
export type QueueItem = {
  key: string;
  scope: string;
  mutationId: string;
  kind: "shared" | "check";
  itemId?: string;
  baseVersion: number;
  payload: SharedState | boolean;
  createdAt: number;
};
export const uid = () => crypto.randomUUID();
export const emptyState = (): SharedState => ({
  events: [],
  packing: [],
  places: [],
  flights: [],
  hotels: [],
  notes: [],
});
export const db = new Dexie("hello-vietnam-sync-v2") as Dexie & {
  snapshots: EntityTable<Snapshot, "scope">;
  queue: EntityTable<QueueItem, "key">;
  meta: EntityTable<{ key: string; value: unknown }, "key">;
};
db.version(1).stores({
  snapshots: "scope",
  queue: "key,scope,kind",
  meta: "key",
});
export function toShared(s: State): SharedState {
  return {
    ...s,
    events: s.events.filter((e) => !e.flightId),
    packing: s.packing.map(({ done, ...p }) => p),
  };
}
export function materialize(
  payload: SharedState,
  checks: CheckRecord[],
): State {
  return syncFlights({
    ...payload,
    packing: payload.packing.map((p) => ({
      ...p,
      done: checks.find((c) => c.item_id === p.id)?.checked ?? false,
    })),
  });
}
export function syncFlights(s: State): State {
  const regular = s.events.filter((e) => !e.flightId);
  return {
    ...s,
    events: [
      ...regular,
      ...s.flights.map((f) => ({
        id: "flight-" + f.id,
        flightId: f.id,
        date: f.departure.slice(0, 10),
        time: f.departure.slice(11),
        end:
          f.arrival.slice(0, 10) === f.departure.slice(0, 10)
            ? f.arrival.slice(11)
            : "",
        name: `${f.from} → ${f.to}`,
        category: "Flight",
        place: `${f.airline} · ${f.number}`,
        mapUrl: "",
        memo: `到着 ${f.arrival.replace("T", " ")}（現地時刻）`,
        url: f.url,
        done: false,
        order: -1,
      })),
    ],
  };
}
export function safeURL(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function validateShared(v: unknown): v is SharedState {
  if (!v || typeof v !== "object") return false;
  const s = v as SharedState;
  const fields: Record<keyof SharedState, string[]> = {
    events: [
      "id",
      "date",
      "time",
      "end",
      "name",
      "category",
      "place",
      "mapUrl",
      "memo",
      "url",
    ],
    packing: ["id", "name", "category"],
    places: [
      "id",
      "name",
      "city",
      "category",
      "address",
      "memo",
      "url",
      "lat",
      "lng",
    ],
    flights: [
      "id",
      "airline",
      "number",
      "departure",
      "arrival",
      "from",
      "to",
      "booking",
      "url",
      "checked",
      "cabin",
      "memo",
    ],
    hotels: [
      "id",
      "name",
      "city",
      "checkin",
      "checkout",
      "address",
      "mapUrl",
      "url",
      "booking",
      "phone",
      "memo",
    ],
    notes: ["id", "name", "category", "memo", "url"],
  };
  return (Object.keys(fields) as (keyof SharedState)[]).every(
    (k) =>
      Array.isArray(s[k]) &&
      s[k].length <= 2000 &&
      s[k].every(
        (r: any) =>
          r &&
          fields[k].every(
            (f) => typeof r[f] === "string" && r[f].length <= 10000,
          ) &&
          r.id.length > 0 &&
          (k !== "packing" ||
            (packingCategories.includes(r.category) &&
              Number.isInteger(r.quantity) &&
              r.quantity > 0 &&
              r.quantity <= 999 &&
              !("done" in r))) &&
          (k !== "events" ||
            (typeof r.done === "boolean" &&
              Number.isFinite(r.order) &&
              /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
              /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time))) &&
          Object.keys(r)
            .filter((f) => f === "url" || f === "mapUrl")
            .every((f) => !r[f] || safeURL(r[f])),
      ) &&
      new Set(s[k].map((r) => r.id)).size === s[k].length,
  );
}
export function validSnapshot(v: unknown): v is Snapshot {
  const s = v as Snapshot;
  return (
    !!s &&
    !!s.identity &&
    typeof s.identity.userId === "string" &&
    typeof s.identity.tripId === "string" &&
    ["admin", "viewer"].includes(s.identity.role) &&
    !!s.document &&
    validateShared(s.document.payload) &&
    Number.isSafeInteger(s.document.version) &&
    Array.isArray(s.checks)
  );
}
export const scopeFor = (i: Pick<Identity, "tripId" | "userId">) =>
  `${i.tripId}:${i.userId}`;
export function overlay(snapshot: Snapshot, queue: QueueItem[]): State {
  const shared = queue.find((q) => q.kind === "shared");
  const payload = shared
    ? (shared.payload as SharedState)
    : snapshot.document.payload;
  const checks = [...snapshot.checks];
  for (const q of queue.filter((q) => q.kind === "check")) {
    const at = checks.findIndex((c) => c.item_id === q.itemId);
    const value = {
      item_id: q.itemId!,
      checked: q.payload as boolean,
      version: q.baseVersion,
      last_mutation: q.mutationId,
    };
    if (at >= 0) checks[at] = value;
    else checks.push(value);
  }
  return materialize(payload, checks);
}

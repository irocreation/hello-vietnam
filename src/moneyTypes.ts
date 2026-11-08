export type MoneyKind = "expense" | "day";
export type MoneyRecord = {
  id: string;
  kind: MoneyKind;
  date: string;
  amount: number;
  name: string;
  category: string;
  memo: string;
  deleted: boolean;
  version: number;
  last_mutation: string | null;
};
export type MoneyCache = { key: string; scope: string; record: MoneyRecord };
export type MoneyQueue = {
  key: string;
  scope: string;
  record: MoneyRecord;
  baseVersion: number;
  mutationId: string;
};
export type Rate = {
  yenPerDong: number;
  date: string;
  fetchedAt: string;
  source: "Frankfurter" | "manual";
};
export const expenseCategories = [
  "食事",
  "カフェ",
  "移動",
  "観光",
  "買い物",
  "宿泊",
  "その他",
];
export function vietnamToday(now = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function parseDong(value: string): number | null {
  let clean = value.normalize("NFKC").trim().replace(/[,\s]/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) clean = clean.replaceAll(".", "");
  if (!/^\d+$/.test(clean)) return null;
  const number = Number(clean);
  return Number.isSafeInteger(number) && number >= 0 && number <= 1e12
    ? number
    : null;
}
export function validMoney(r: MoneyRecord) {
  return (
    r &&
    ["expense", "day"].includes(r.kind) &&
    typeof r.id === "string" &&
    validDate(r.date) &&
    Number.isSafeInteger(r.amount) &&
    r.amount >= 0 &&
    r.amount <= 1e12 &&
    typeof r.name === "string" &&
    r.name.length <= 200 &&
    typeof r.memo === "string" &&
    r.memo.length <= 5000 &&
    typeof r.category === "string" &&
    typeof r.deleted === "boolean" &&
    Number.isSafeInteger(r.version) &&
    r.version >= 0 &&
    (r.kind === "day"
      ? r.id === r.date && r.amount === 0
      : /^[a-f0-9-]{36}$/i.test(r.id) &&
        r.amount > 0 &&
        expenseCategories.includes(r.category))
  );
}
export const dong = (value: number) =>
  new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 }).format(value);
export const yen = (value: number, rate?: Rate) =>
  rate
    ? new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0,
      }).format(value * rate.yenPerDong)
    : "—";
export function validRate(r: unknown): r is Rate {
  const rate = r as Rate;
  return (
    !!rate &&
    Number.isFinite(rate.yenPerDong) &&
    rate.yenPerDong > 0 &&
    validDate(rate.date) &&
    Number.isFinite(Date.parse(rate.fetchedAt)) &&
    ["Frankfurter", "manual"].includes(rate.source)
  );
}

export const expensesForDay = (records: MoneyRecord[], date: string) =>
  records.filter((r) => r.kind === "expense" && !r.deleted && r.date === date);
export const totalForDay = (records: MoneyRecord[], date: string) =>
  expensesForDay(records, date).reduce((sum, r) => sum + r.amount, 0);

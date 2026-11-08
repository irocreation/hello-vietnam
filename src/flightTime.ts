import type { Flight } from "./data";
const zones: Record<string, { zone: string; label: string }> = {
  NRT: { zone: "Asia/Tokyo", label: "日本時間" },
  HND: { zone: "Asia/Tokyo", label: "日本時間" },
  KIX: { zone: "Asia/Tokyo", label: "日本時間" },
  NGO: { zone: "Asia/Tokyo", label: "日本時間" },
  FUK: { zone: "Asia/Tokyo", label: "日本時間" },
  OKA: { zone: "Asia/Tokyo", label: "日本時間" },
  SGN: { zone: "Asia/Ho_Chi_Minh", label: "ベトナム時間" },
  DAD: { zone: "Asia/Ho_Chi_Minh", label: "ベトナム時間" },
  HAN: { zone: "Asia/Ho_Chi_Minh", label: "ベトナム時間" },
  CXR: { zone: "Asia/Ho_Chi_Minh", label: "ベトナム時間" },
  HPH: { zone: "Asia/Ho_Chi_Minh", label: "ベトナム時間" },
  PQC: { zone: "Asia/Ho_Chi_Minh", label: "ベトナム時間" },
  HKG: { zone: "Asia/Hong_Kong", label: "香港時間" },
  SIN: { zone: "Asia/Singapore", label: "シンガポール時間" },
  BKK: { zone: "Asia/Bangkok", label: "タイ時間" },
  DMK: { zone: "Asia/Bangkok", label: "タイ時間" },
  TPE: { zone: "Asia/Taipei", label: "台湾時間" },
  ICN: { zone: "Asia/Seoul", label: "韓国時間" },
  GMP: { zone: "Asia/Seoul", label: "韓国時間" },
  KUL: { zone: "Asia/Kuala_Lumpur", label: "マレーシア時間" },
};
export const airportZone = (code: string) => zones[code.trim().toUpperCase()];
export function airportTime(local: string, code: string): number | null {
  const info = airportZone(code);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!info || !match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(target);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59
  )
    return null;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: info.zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const zoned = (epoch: number) => {
    const p = Object.fromEntries(
      formatter.formatToParts(epoch).map((x) => [x.type, x.value]),
    );
    return Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
    );
  };
  let epoch = target;
  for (let i = 0; i < 3; i++) {
    const difference = target - zoned(epoch);
    epoch += difference;
    if (difference === 0) break;
  }
  return zoned(epoch) === target ? epoch : null;
}
export function flightMinutes(
  f: Pick<Flight, "departure" | "arrival" | "from" | "to">,
): number | null {
  const departure = airportTime(f.departure, f.from),
    arrival = airportTime(f.arrival, f.to);
  if (departure === null || arrival === null || arrival <= departure)
    return null;
  return Math.round((arrival - departure) / 60000);
}
export function flightDuration(
  f: Pick<Flight, "departure" | "arrival" | "from" | "to">,
): string | null {
  const minutes = flightMinutes(f);
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return hours ? `${hours}時間${rest ? `${rest}分` : ""}` : `${rest}分`;
}

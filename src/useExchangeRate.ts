import { useEffect, useRef, useState } from "react";
import { db } from "./data";
import { validRate, vietnamToday, type Rate } from "./moneyTypes";
const KEY = "wallet-rate-v1";
export function useExchangeRate() {
  const [rate, setRate] = useState<Rate>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const working = useRef(false);
  async function refresh() {
    if (working.current) return;
    if (!navigator.onLine) {
      setError(
        "オフラインです。保存済みのレート、または手動レートを使えます。",
      );
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        "https://api.frankfurter.dev/v2/rate/VND/JPY",
        {
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw Error("rate");
      const value = await response.json();
      const next: Rate = {
        yenPerDong: value.rate,
        date: value.date,
        fetchedAt: new Date().toISOString(),
        source: "Frankfurter",
      };
      if (value.base !== "VND" || value.quote !== "JPY" || !validRate(next))
        throw Error("data");
      if (!mounted.current) return;
      await db.meta.put({ key: KEY, value: next });
      if (mounted.current) setRate(next);
    } catch {
      if (mounted.current)
        setError(
          "参考レートを取得できませんでした。保存済みレートを使うか、手動で設定してください。",
        );
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const stored = await db.meta.get(KEY);
        if (!mounted.current) return;
        if (stored && validRate(stored.value)) {
          setRate(stored.value);
          if (
            stored.value.source === "manual" ||
            Date.now() - Date.parse(stored.value.fetchedAt) < 24 * 3600000
          )
            return;
        }
        void refresh();
      } catch {
        if (mounted.current) setError("レートの保存領域を開けません。");
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);
  async function manual(dongPerYen: number) {
    if (!Number.isFinite(dongPerYen) || dongPerYen <= 0 || dongPerYen > 1e9)
      throw Error("1円あたりのドンを正しく入力してください。");
    const next: Rate = {
      yenPerDong: 1 / dongPerYen,
      date: vietnamToday(),
      fetchedAt: new Date().toISOString(),
      source: "manual",
    };
    await db.meta.put({ key: KEY, value: next });
    setRate(next);
    setError("");
  }
  return { rate, busy, error, refresh, manual };
}

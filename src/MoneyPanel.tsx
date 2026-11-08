import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Wallet,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  X,
  Undo2,
  StickyNote,
  Coins,
} from "lucide-react";
import { uid } from "./data";
import type { MoneyEngine } from "./moneyEngine";
import {
  expenseCategories,
  expensesForDay,
  totalForDay,
  dong,
  yen,
  parseDong,
  vietnamToday,
  type MoneyRecord,
} from "./moneyTypes";
import { useExchangeRate } from "./useExchangeRate";
export default function MoneyPanel({ engine }: { engine: MoneyEngine }) {
  const view = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const { rate, busy, error: rateError, refresh, manual } = useExchangeRate();
  const [date, setDate] = useState(vietnamToday());
  const [amount, setAmount] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("食事");
  const [editing, setEditing] = useState<MoneyRecord>();
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [note, setNote] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [deleted, setDeleted] = useState<MoneyRecord>();
  const [rateInput, setRateInput] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = parseDong(amount);
  const entries = expensesForDay(view.records, date);
  const total = totalForDay(view.records, date);
  const dayMemo = view.records.find(
    (r) => r.kind === "day" && r.date === date && !r.deleted,
  );
  const today = vietnamToday();
  useEffect(() => {
    if (!noteDirty) setNote(dayMemo?.memo ?? "");
  }, [dayMemo?.memo, date, noteDirty]);
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);
  function moveDay(delta: number) {
    const at = new Date(date + "T00:00:00Z");
    at.setUTCDate(at.getUTCDate() + delta);
    setDate(at.toISOString().slice(0, 10));
    setNoteDirty(false);
    setEditing(undefined);
    setAmount("");
    setName("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (parsed === null || parsed <= 0) {
      setError("1ドン以上の金額を入力してください。");
      return;
    }
    setSaving(true);
    try {
      await engine.save({
        id: editing?.id ?? uid(),
        kind: "expense",
        date,
        amount: parsed,
        name: name.trim() || category,
        category,
        memo: editing?.memo ?? "",
        deleted: false,
        version: editing?.version ?? 0,
        last_mutation: editing?.last_mutation ?? null,
      });
      setAmount("");
      setName("");
      setEditing(undefined);
      setFeedback("支出を端末に保存しました。接続時に自動同期します。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "記録を保存できませんでした。");
    } finally {
      setSaving(false);
    }
  }
  function edit(r: MoneyRecord) {
    setEditing(r);
    setAmount(String(r.amount));
    setName(r.name);
    setCategory(r.category);
    setError("");
  }
  async function remove(r: MoneyRecord) {
    try {
      await engine.save({ ...r, deleted: true });
      setDeleted(r);
      setFeedback("支出を一覧から外しました。「元に戻す」で復元できます。");
    } catch {
      setError("記録を変更できませんでした。");
    }
  }
  async function saveNote() {
    try {
      await engine.save({
        id: date,
        kind: "day",
        date,
        amount: 0,
        name: "",
        category: "その他",
        memo: note,
        deleted: false,
        version: dayMemo?.version ?? 0,
        last_mutation: dayMemo?.last_mutation ?? null,
      });
      setNoteDirty(false);
      setFeedback("日別メモを保存しました。");
    } catch {
      setError("日別メモを保存できませんでした。");
    }
  }
  const labelDate = new Date(date + "T00:00:00Z").toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  });
  return (
    <section className="money-panel" aria-label="自分のおこづかい帳">
      <header className="wallet-heading">
        <span className="wallet-symbol">
          <Wallet size={25} />
        </span>
        <div>
          <span className="eyebrow">MY LITTLE TRAVEL WALLET</span>
          <h2>旅のおこづかい帳</h2>
          <p>あなた専用の支出とメモ。金額はベトナムドンで記録。</p>
        </div>
      </header>
      <div className="wallet-date">
        <button
          className="icon-button"
          aria-label="前日の支出"
          onClick={() => moveDay(-1)}
        >
          <ChevronLeft size={20} />
        </button>
        <label>
          <span>{labelDate}</span>
          <input
            aria-label="支出を表示する日付"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setNoteDirty(false);
                setEditing(undefined);
                setAmount("");
                setName("");
              }
            }}
          />
        </label>
        <button
          className="icon-button"
          aria-label="翌日の支出"
          onClick={() => moveDay(1)}
        >
          <ChevronRight size={20} />
        </button>
        <button
          className="today-button"
          onClick={() => {
            setDate(today);
            setNoteDirty(false);
            setEditing(undefined);
            setAmount("");
            setName("");
          }}
        >
          今日
        </button>
      </div>
      <div className="wallet-summary">
        <div>
          <span className="wallet-summary-label">
            {date === today ? "今日" : "この日"}使ったお金
          </span>
          <strong>
            {dong(total)}
            <small>₫</small>
          </strong>
          <span className="wallet-count">{entries.length}件の支出</span>
        </div>
        <div className="wallet-yen">
          <span>日本円の目安</span>
          <b>
            {rate ? "約 " : ""}
            {yen(total, rate)}
          </b>
          <small>
            {rate ? "表示中のレートで換算" : "レートを設定すると表示します"}
          </small>
        </div>
      </div>
      <div className="wallet-rate">
        <Coins size={16} />
        <div>
          {rate ? (
            <>
              <b>1,000 ₫ ≈ {yen(1000, rate)}</b>
              <span>
                {rate.source === "manual" ? "手動レート" : "参考レート"} ·{" "}
                {rate.date.replaceAll("-", ".")}
                {!navigator.onLine ? " · オフラインで利用中" : ""}
              </span>
            </>
          ) : (
            <span>レートを取得、または手動で設定してください。</span>
          )}
        </div>
        <button
          className="icon-button"
          aria-label="為替レートを更新"
          disabled={busy || !navigator.onLine}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} className={busy ? "spinning" : ""} />
        </button>
      </div>
      <details className="rate-settings">
        <summary>換算レートを調整</summary>
        <p>
          両替時のレートを使う場合は、1円あたりのドンを入力してください。この端末だけに保存します。
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await manual(
                Number(rateInput.normalize("NFKC").replaceAll(",", "")),
              );
              setFeedback("手動レートを保存しました。");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "レートを確認してください。",
              );
            }
          }}
        >
          <label>
            1円 ＝{" "}
            <input
              aria-label="1円あたりのドン"
              inputMode="decimal"
              placeholder={rate ? (1 / rate.yenPerDong).toFixed(2) : "例：160"}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              required
            />{" "}
            ₫
          </label>
          <button className="secondary">設定する</button>
        </form>
        <button
          className="text-link"
          disabled={!navigator.onLine || busy}
          onClick={() => void refresh()}
        >
          参考レートを取得する
        </button>
        <a
          href="https://frankfurter.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          為替データ：Frankfurter
        </a>
      </details>
      {rateError && (
        <p className="wallet-message" role="status">
          {rateError}
        </p>
      )}
      <form className="expense-form" onSubmit={save}>
        <div className="section-heading">
          <h3>{editing ? "支出を編集" : "金額を入力して、さっと円換算"}</h3>
          {editing && (
            <button
              type="button"
              className="icon-button"
              aria-label="支出の編集をやめる"
              onClick={() => {
                setEditing(undefined);
                setAmount("");
                setName("");
              }}
            >
              <X size={17} />
            </button>
          )}
        </div>
        <label className="wallet-amount">
          <span>支払った金額</span>
          <div>
            <input
              aria-label="支払った金額（ベトナムドン）"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              maxLength={20}
            />
            <b>VND</b>
          </div>
        </label>
        <div className="wallet-converted" aria-live="polite">
          日本円で{" "}
          <strong>
            {parsed !== null && rate ? "約 " + yen(parsed, rate) : "—"}
          </strong>
        </div>
        <div className="amount-presets">
          {[20000, 50000, 100000, 500000].map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setAmount(String(value))}
            >
              {dong(value)} ₫
            </button>
          ))}
        </div>
        <div className="expense-fields">
          <label className="field">
            使いみち
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：ランチ、タクシー"
              maxLength={200}
            />
          </label>
          <label className="field">
            カテゴリー
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {expenseCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <button type="submit" className="primary" disabled={saving}>
          {editing ? <Check size={16} /> : <Plus size={16} />}{" "}
          {editing ? "変更を保存" : "この日の支出に登録"}
        </button>
        <p className="wallet-hint">
          換算だけなら登録ボタンを押す必要はありません。
        </p>
      </form>
      <div className="expense-history">
        <div className="section-heading">
          <h3>この日の支出</h3>
          <span className={`wallet-sync ${view.status}`}>
            {view.status === "synced"
              ? "同期済み"
              : view.status === "syncing"
                ? "同期中"
                : view.status === "offline"
                  ? "オフライン"
                  : "同期エラー"}
            {view.queueCount ? ` · 未送信${view.queueCount}件` : ""}
          </span>
        </div>
        {!entries.length ? (
          <p className="wallet-empty">
            まだ支出はありません。小さなお買い物から、ひとつずつ。
          </p>
        ) : (
          <ul>
            {entries.map((r) => (
              <li key={r.id}>
                <span className="expense-category">{r.category}</span>
                <div>
                  <b>{r.name}</b>
                  <small>
                    {rate ? "約 " + yen(r.amount, rate) : "換算レート未設定"}
                  </small>
                </div>
                <strong>
                  {dong(r.amount)}
                  <small> ₫</small>
                </strong>
                <button
                  className="icon-button"
                  aria-label={`${r.name}の支出を編集`}
                  onClick={() => edit(r)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${r.name}の支出を一覧から外す`}
                  onClick={() => void remove(r)}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {deleted && (
          <button
            className="undo-expense"
            onClick={() =>
              void engine
                .save({ ...deleted, deleted: false })
                .then(() => {
                  setDeleted(undefined);
                  setFeedback("支出を元に戻しました。");
                })
                .catch(() => setError("復元できませんでした。"))
            }
          >
            <Undo2 size={15} />「{deleted.name}」を元に戻す
          </button>
        )}
      </div>
      <div className="day-memo">
        <h3>
          <StickyNote size={18} />
          この日のメモ
        </h3>
        <label className="field">
          <span>自分用の日別メモ</span>
          <textarea
            rows={3}
            maxLength={5000}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteDirty(true);
            }}
            placeholder="例：夕食は夫がまとめて支払い。タクシー代はあとで精算。"
          />
        </label>
        <button
          className="secondary"
          disabled={!noteDirty}
          onClick={() => void saveNote()}
        >
          <Check size={15} />
          メモを保存
        </button>
      </div>
      {(error || view.error) && (
        <div className="wallet-error" role="alert">
          <p>{error || view.error}</p>
          {view.error && (
            <button onClick={() => void engine.retry()}>同期を再試行</button>
          )}
        </div>
      )}
      {feedback && (
        <p className="wallet-feedback" role="status">
          <Check size={15} />
          {feedback}
        </p>
      )}
      {view.conflict && (
        <div className="money-conflict" role="alert">
          <h3>同じ記録が別の端末で更新されています</h3>
          <div>
            <section>
              <b>この端末</b>
              <p>
                {view.conflict.local.date} ·{" "}
                {view.conflict.local.name || "日別メモ"}
                <br />
                {view.conflict.local.kind === "expense"
                  ? dong(view.conflict.local.amount) + " ₫"
                  : ""}
                {view.conflict.local.deleted ? "（一覧から外す）" : ""}
                <br />
                {view.conflict.local.memo}
              </p>
            </section>
            <section>
              <b>サーバー</b>
              <p>
                {view.conflict.remote.date} ·{" "}
                {view.conflict.remote.name || "日別メモ"}
                <br />
                {view.conflict.remote.kind === "expense"
                  ? dong(view.conflict.remote.amount) + " ₫"
                  : ""}
                {view.conflict.remote.deleted ? "（一覧から外す）" : ""}
                <br />
                {view.conflict.remote.memo}
              </p>
            </section>
          </div>
          <button
            className="secondary"
            onClick={() => void engine.resolve(false)}
          >
            サーバーを採用
          </button>
          <button className="primary" onClick={() => void engine.resolve(true)}>
            この端末を採用
          </button>
        </div>
      )}
      <p className="wallet-footnote">
        「今日」はベトナム時間基準です。支出・日別メモは自分だけが閲覧・編集できます。日本円は表示中の参考レートによる目安で、手数料は含みません。入力金額は為替サービスへ送信しません。
      </p>
    </section>
  );
}

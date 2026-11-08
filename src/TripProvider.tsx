import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Dexie from "dexie";
import {
  LogIn,
  LockKeyhole,
  WifiOff,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import { db, validSnapshot, scopeFor, type Identity } from "./data";
import {
  configured,
  supabase,
  verifiedIdentity,
  createRemote,
} from "./supabase";
import { SyncEngine, type SyncView } from "./sync";
import { VietnamArt, Flower } from "./Art";
export type TripController = {
  engine: SyncEngine;
  view: SyncView;
  logout: () => Promise<void>;
};
export function TripProvider({
  children,
}: {
  children: (controller: TripController) => ReactNode;
}) {
  const accessEpoch = useRef(0);
  const loggedOut = useRef(false);
  const [engine, setEngine] = useState<SyncEngine>();
  const [booting, setBooting] = useState(true);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    if (!configured) {
      setBooting(false);
      return;
    }
    let alive = true;
    let current: SyncEngine | undefined;
    let generation = 0;
    async function mount(i: Identity) {
      if (!alive || loggedOut.current) return;
      const epoch = accessEpoch.current;
      if (
        current?.active &&
        current.getSnapshot().identity.userId === i.userId &&
        current.getSnapshot().identity.tripId === i.tripId
      ) {
        void current.sync();
        return;
      }
      current?.dispose();
      const instance = new SyncEngine(i, createRemote(i));
      current = instance;
      await instance.load();
      if (
        !alive ||
        loggedOut.current ||
        epoch !== accessEpoch.current ||
        current !== instance
      ) {
        instance.dispose();
        return;
      }
      setEngine(instance);
      await db.meta.put({ key: "active", value: scopeFor(i) });
      if (navigator.onLine) void instance.sync();
    }
    async function clearLocal() {
      current?.dispose();
      current = undefined;
      setEngine(undefined);
      await db.transaction(
        "rw",
        [db.snapshots, db.queue, db.meta, db.photos],
        async () => {
          await db.snapshots.clear();
          await db.queue.clear();
          await db.meta.clear();
          await db.photos.clear();
        },
      );
      await Dexie.delete("hello-vietnam-v1");
    }
    async function restore() {
      const attempt = ++generation;
      const epoch = accessEpoch.current;
      const valid = () =>
        alive &&
        attempt === generation &&
        epoch === accessEpoch.current &&
        !loggedOut.current;
      if (!valid()) return;
      try {
        const active = await db.meta.get("active");
        const cache =
          active && typeof active.value === "string"
            ? await db.snapshots.get(active.value)
            : undefined;
        if (!navigator.onLine) {
          if (cache && validSnapshot(cache) && valid())
            await mount(cache.identity);
          return;
        }
        if (navigator.onLine) {
          const {
            data: { session },
            error: sessionError,
          } = await supabase!.auth.getSession();
          if (!valid()) return;
          if (session) {
            try {
              const identity = await verifiedIdentity();
              if (!valid()) return;
              await mount(identity);
              setMessage("");
            } catch {
              if (!valid()) return;
              if (
                cache &&
                validSnapshot(cache) &&
                cache.identity.userId === session.user.id
              )
                await mount(cache.identity);
              setMessage(
                "所属または認証を確認できません。設定を確認して再試行してください。",
              );
              current?.fail(
                "所属・認証を確認できません。未送信データは保持しています。",
              );
            }
          } else if (sessionError && cache && validSnapshot(cache)) {
            await mount(cache.identity);
            current?.fail(
              "認証サーバーへ接続できません。保存済みの情報を表示しています。",
            );
          } else if (cache) {
            await clearLocal();
          }
        }
      } catch {
        if (alive)
          setMessage(
            "ログイン情報を確認できません。接続とブラウザの保存設定を確認してください。",
          );
      } finally {
        if (alive) setBooting(false);
      }
    }
    void restore();
    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange((event, session) => {
      if (
        session &&
        current &&
        session.user.id !== current.getSnapshot().identity.userId
      ) {
        current.dispose();
        current = undefined;
        setEngine(undefined);
      }
      if (event === "SIGNED_OUT") {
        generation++;
        if (!loggedOut.current) {
          loggedOut.current = true;
          accessEpoch.current++;
          void clearLocal();
        }
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
        setTimeout(() => {
          if (alive && !loggedOut.current) void restore();
        }, 0);
    });
    const network = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        supabase!.auth.startAutoRefresh();
        void restore();
      } else {
        supabase!.auth.stopAutoRefresh();
        current?.setNetwork();
      }
    };
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      alive = false;
      generation++;
      current?.dispose();
      subscription.unsubscribe();
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    loggedOut.current = false;
    accessEpoch.current++;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setPassword("");
    } catch {
      setMessage(
        "ログインできません。メールアドレス・パスワード・接続を確認してください。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    loggedOut.current = true;
    accessEpoch.current++;
    setBusy(true);
    engine?.dispose();
    setEngine(undefined);
    await db.transaction(
      "rw",
      [db.snapshots, db.queue, db.meta, db.photos],
      async () => {
        await db.snapshots.clear();
        await db.queue.clear();
        await db.meta.clear();
        await db.photos.clear();
      },
    );
    await Dexie.delete("hello-vietnam-v1");
    if (supabase) {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        localStorage.removeItem("hello-vietnam-auth-v2");
        window.location.reload();
        setMessage(
          "端末の旅行キャッシュを削除しました。ログアウトの通信確認はできませんでした。再ログインしてください。",
        );
      }
    }
    setBusy(false);
  }
  if (engine)
    return (
      <Connected engine={engine} logout={logout}>
        {children}
      </Connected>
    );
  return (
    <div className="login-page">
      <div className="login-story">
        <span className="eyebrow">OUR LITTLE VIETNAM TRIP</span>
        <h1>
          HELLO
          <br />
          VIETNAM<span>!</span>
        </h1>
        <p>
          ふたりだけの、
          <br />
          小さな冒険のしおり。
        </p>
        <VietnamArt />
        <span className="login-caption">A little trip. A lot of memories.</span>
      </div>
      <section className="login-panel">
        <Flower />
        <span className="eyebrow">JUST THE TWO OF US</span>
        <h2>{configured ? "おかえりなさい。" : "旅のしおりを、つなごう。"}</h2>
        <p>
          {configured
            ? "ログインして、ふたりの旅をひらこう。"
            : "Supabaseの設定がまだ完了していません。設定後、管理者と閲覧者の2人だけがログインできます。"}
        </p>
        {booting ? (
          <p role="status">保存済みのログイン情報を確認しています…</p>
        ) : configured ? (
          <form onSubmit={login}>
            <label className="field">
              メールアドレス
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              パスワード
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy || !online}>
              <LogIn size={18} />
              {busy ? "ログイン中…" : "ログインする"}
            </button>
            {!online && (
              <p className="login-warning">
                <WifiOff size={16} />
                初回ログインには接続が必要です。
              </p>
            )}
          </form>
        ) : (
          <div className="setup-guide">
            <ol>
              <li>SupabaseでSQLと2人のアカウントを設定</li>
              <li>
                <code>.env.example</code>をもとに接続先と公開用キーを設定
              </li>
              <li>GitHub Pagesへビルド・配置</li>
            </ol>
            <p>詳しい手順は同梱のREADMEに記載しています。</p>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
            >
              Supabaseを開く
              <ArrowUpRight size={16} />
            </a>
          </div>
        )}
        {message && (
          <p className="login-error" role="alert">
            {message}
          </p>
        )}
        <div className="login-privacy">
          <LockKeyhole size={16} />
          <span>
            招待された2人専用。新規登録はできません。
            <br />
            一度取得した旅の情報は、オフラインでも。
          </span>
        </div>
      </section>
    </div>
  );
}
function Connected({
  engine,
  logout,
  children,
}: {
  engine: SyncEngine;
  logout: () => Promise<void>;
  children: (c: TripController) => ReactNode;
}) {
  const view = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    const i = view.identity;
    const client = supabase!;
    const refresh = () => {
      void engine.sync();
    };
    const visibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const channel = client
      .channel(`trip:${i.tripId}:${i.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "travel_documents",
          filter: `trip_id=eq.${i.tripId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "packing_checks",
          filter: `user_id=eq.${i.userId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `user_id=eq.${i.userId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refresh();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          engine.fail("自動更新の接続を確認できません。再試行してください。");
      });
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      client.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [engine]);
  if (!view.data)
    return (
      <div className="loading">
        <Flower />
        <h1>HELLO VIETNAM</h1>
        <p>{view.error || "ふたりの旅を取得しています…"}</p>
        <button className="secondary" onClick={() => engine.retry()}>
          <RefreshCw size={16} />
          再試行
        </button>
        <button className="text-button" onClick={logout}>
          ログアウト
        </button>
      </div>
    );
  return children({ engine, view, logout });
}

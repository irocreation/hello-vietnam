import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  Home,
  CalendarDays,
  Luggage,
  MapPin,
  Info,
  ArrowUpRight,
  ArrowRight,
  Plane,
  Plus,
  Check,
  ChevronRight,
  Wifi,
  WifiOff,
  Settings,
  X,
  Trash2,
  Pencil,
  Heart,
  Search,
  Download,
  Upload,
  FileText,
  ExternalLink,
  Coffee,
  Utensils,
  Hotel,
  Camera,
  ShoppingBag,
  Bus,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Leaf,
  Sun,
  CheckCircle2,
  Paperclip,
} from "lucide-react";
import {
  syncFlights,
  uid,
  categories,
  packingCategories,
  cities,
  safeURL,
  type State,
  type Event,
  type Place,
  type HotelRecord,
  type SharedState,
} from "./data";
import { TripProvider, type TripController } from "./TripProvider";
import PlacePhoto from "./PlacePhoto";
import MoneyPanel from "./MoneyPanel";
import { airportTime, airportZone, flightDuration } from "./flightTime";
import { VietnamArt, Flower } from "./Art";
type Tab = "Home" | "Schedule" | "Packing" | "Places" | "Info";
type Editor = {
  kind: "events" | "packing" | "places" | "flights" | "hotels" | "notes";
  value: any;
  fresh: boolean;
};
const nav = [
  { name: "Home", label: "ホーム", icon: Home },
  { name: "Schedule", label: "スケジュール", icon: CalendarDays },
  { name: "Packing", label: "持ち物", icon: Luggage },
  { name: "Places", label: "行きたい場所", icon: MapPin },
  { name: "Info", label: "旅の情報", icon: Info },
] as const;
const icons: Record<string, typeof Plane> = {
  Flight: Plane,
  Hotel,
  Food: Utensils,
  Cafe: Coffee,
  Sightseeing: Camera,
  Shopping: ShoppingBag,
  Transport: Bus,
  Other: MoreHorizontal,
};
const dateLabel = (date: string) =>
  date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "";
const dayJP = ["木", "金", "土", "日", "月"];
function Icon({ category, size = 20 }: { category: string; size?: number }) {
  const I = icons[category] ?? MapPin;
  return <I size={size} />;
}
function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}
export default function App() {
  return (
    <TripProvider>
      {(controller) => <TripApp controller={controller} />}
    </TripProvider>
  );
}
function TripApp({ controller }: { controller: TripController }) {
  const { engine, money, view, logout } = controller;
  const moneyView = useSyncExternalStore(money.subscribe, money.getSnapshot);
  const data = view.data!;
  const isAdmin = view.identity.role === "admin";
  const startDate = view.identity.startDate;
  const endDate = view.identity.endDate;
  const tripDays = Array.from(
    {
      length: Math.min(
        31,
        Math.max(
          1,
          Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) +
            1,
        ),
      ),
    },
    (_, i) =>
      new Date(Date.parse(startDate) + i * 86400000).toISOString().slice(0, 10),
  );
  const dataRef = useRef(data);
  dataRef.current = data;
  const [tab, setTab] = useState<Tab>("Home");
  const [online, setOnline] = useState(navigator.onLine);
  const pendingCount = view.queueCount + moneyView.queueCount;
  const overallStatus = !online
    ? "offline"
    : view.status === "error" || moneyView.status === "error"
      ? "error"
      : view.status === "syncing" || moneyView.status === "syncing"
        ? "syncing"
        : "synced";
  const syncError = view.error || moneyView.error;

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor>();
  const [settings, setSettings] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [day, setDay] = useState(startDate);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [city, setCity] = useState("すべて");
  const [query, setQuery] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [sort, setSort] = useState<"time" | "custom">("time");
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    run: () => void;
  }>();
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    setQuery("");
  }, [tab]);
  useEffect(() => {
    if (!isAdmin) setEditor(undefined);
  }, [isAdmin]);
  function commit(next: State) {
    if (!isAdmin) {
      setError("共有情報の編集は管理者専用です。");
      return;
    }
    void engine
      .edit(next)
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "端末に保存できません。空き容量を確認してください。",
        ),
      );
  }
  function update<K extends keyof State>(
    key: K,
    id: string,
    patch: Partial<State[K][number]>,
  ) {
    if (key === "packing" && "done" in patch) {
      void engine
        .check(id, Boolean(patch.done))
        .catch(() =>
          setError(
            "チェックを保存できませんでした。空き容量を確認してください。",
          ),
        );
      return;
    }
    if (!isAdmin) return;
    commit({
      ...dataRef.current,
      [key]: dataRef.current[key].map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    });
  }
  function open(kind: Editor["kind"], value?: any) {
    if (!isAdmin) return;
    const defaults = {
      events: {
        id: uid(),
        date: day,
        time: "12:00",
        end: "13:00",
        name: "",
        category: "Sightseeing",
        place: "",
        mapUrl: "",
        memo: "",
        url: "",
        done: false,
        order: data?.events.length ?? 0,
      },
      packing: {
        id: uid(),
        name: "",
        category: "必需品",
        quantity: 1,
        done: false,
      },
      places: {
        id: uid(),
        name: "",
        city: "ホーチミン",
        category: "Cafe",
        address: "",
        memo: "",
        url: "",
        lat: "",
        lng: "",
        visited: false,
        favorite: false,
      },
      flights: {
        id: uid(),
        airline: "",
        number: "",
        departure: startDate + "T12:00",
        arrival: startDate + "T13:00",
        from: "",
        to: "",
        booking: "",
        url: "",
        checked: "",
        cabin: "",
        memo: "",
      },
      hotels: {
        id: uid(),
        name: "",
        city: "ホーチミン",
        checkin: "",
        checkout: "",
        address: "",
        mapUrl: "",
        url: "",
        booking: "",
        phone: "",
        memo: "",
      },
      notes: { id: uid(), name: "", category: "その他メモ", memo: "", url: "" },
    };
    setEditor({
      kind,
      value: value ? { ...value } : defaults[kind],
      fresh: !value,
    });
  }
  async function saveEditor(e: React.FormEvent) {
    e.preventDefault();
    if (!editor || !isAdmin) return;
    const v = editor.value;
    if ((v.url && !safeURL(v.url)) || (v.mapUrl && !safeURL(v.mapUrl))) {
      setError("URLは https:// で入力してください。");
      return;
    }
    if (editor.kind === "events" && v.end && v.end <= v.time) {
      setError(
        "終了時刻は開始時刻より後にしてください。日をまたぐ予定は日別に登録できます。",
      );
      return;
    }
    if (
      editor.kind === "hotels" &&
      v.checkin &&
      v.checkout &&
      v.checkout <= v.checkin
    ) {
      setError("チェックアウトはチェックインより後の日時を選択してください。");
      return;
    }
    if (editor.kind === "flights") {
      const departure = airportTime(v.departure, v.from),
        arrival = airportTime(v.arrival, v.to);
      if (departure !== null && arrival !== null && arrival <= departure) {
        setError(
          "到着日時を確認してください。各空港の現地時刻と時差で計算しています。",
        );
        return;
      }
    }
    const next = {
      ...data,
      [editor.kind]: editor.fresh
        ? [...data[editor.kind], v]
        : data[editor.kind].map((x) => (x.id === v.id ? v : x)),
    };
    try {
      await engine.edit(editor.kind === "flights" ? syncFlights(next) : next);
      setEditor(undefined);
      setNotice(
        online
          ? "端末に保存しました。自動同期します。"
          : "端末に保存しました。再接続後に同期します。",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "保存できませんでした。空き容量を確認してください。",
      );
    }
  }
  function remove() {
    if (!editor || !isAdmin) return;
    const ed = editor;
    setConfirmAction({
      title: "この項目を削除しますか？",
      run: () => {
        const next = {
          ...data,
          [ed.kind]: data[ed.kind].filter((x) => x.id !== ed.value.id),
        };
        commit(ed.kind === "flights" ? syncFlights(next) : next);
        setEditor(undefined);
        setConfirmAction(undefined);
      },
    });
  }
  function external(url: string) {
    if (!online) {
      setNotice(
        "リンクを開くにはインターネット接続が必要です。保存済みの住所・メモをご確認ください。",
      );
      return;
    }
    const safe = safeURL(url);
    if (safe) window.open(safe, "_blank", "noopener,noreferrer");
    else setError("有効なURLを登録してください。");
  }
  function map(p: Place) {
    external(
      p.url ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.address}`)}`,
    );
  }
  const packed = data.packing.filter((x) => x.done).length;
  const progress = Math.round(
    (packed / Math.max(data.packing.length, 1)) * 100,
  );
  const jstDay = new Date(clock + 9 * 3600000).toISOString().slice(0, 10);
  const daysLeft = Math.ceil(
    (Date.parse(startDate + "T00:00:00+09:00") -
      Date.parse(jstDay + "T00:00:00+09:00")) /
      86400000,
  );
  const during = jstDay >= startDate && jstDay <= endDate;
  const dayNumber =
    1 + Math.round((Date.parse(jstDay) - Date.parse(startDate)) / 86400000);
  const nextFlight = [...data.flights]
    .sort((a, b) => a.departure.localeCompare(b.departure))
    .find((f) => {
      const departure = airportTime(f.departure, f.from);
      return departure !== null
        ? departure > clock
        : f.departure.slice(0, 10) >= jstDay;
    });
  const todayEvents = data.events
    .filter((e) => e.date === jstDay)
    .sort((a, b) => a.time.localeCompare(b.time));
  const go = (next: Tab) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const sectionTitle = (eyebrow: string, title: string, sub: string) => (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>
        {title}
        <span className="red-dot">.</span>
      </h1>
      <p>{sub}</p>
    </div>
  );
  const overlaps = (e: Event) =>
    data.events.some(
      (o) =>
        o.id !== e.id &&
        o.date === e.date &&
        o.time < (e.end || e.time) &&
        e.time < (o.end || o.time),
    );
  const move = (e: Event, delta: number) => {
    const rows = data.events
      .filter((x) => x.date === day)
      .sort((a, b) => a.order - b.order);
    const index = rows.findIndex((x) => x.id === e.id),
      other = rows[index + delta];
    if (!other) return;
    [rows[index], rows[index + delta]] = [rows[index + delta], rows[index]];
    commit({
      ...data,
      events: data.events.map((x) => {
        const index = rows.findIndex((r) => r.id === x.id);
        return index < 0 ? x : { ...x, order: index };
      }),
    });
    setSort("custom");
  };
  return (
    <>
      <div className="app-shell">
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => go("Home")}
            aria-label="ホーム"
          >
            <span>
              HELLO<span className="brand-flower">✳</span>
              <br />
              VIETNAM<span className="brand-dot">.</span>
            </span>
          </button>
          <span className="brand-caption">OUR LITTLE VIETNAM TRIP</span>
          <div className="sidebar-rule" />
          {nav.map((n) => (
            <button
              key={n.name}
              className={`side-link ${tab === n.name ? "active" : ""}`}
              onClick={() => go(n.name)}
            >
              <n.icon size={20} />
              <span>
                {n.name}
                <small>{n.label}</small>
              </span>
              {tab === n.name && <span className="nav-mark" />}
            </button>
          ))}
          <div className="side-bottom">
            <div className="trip-stamp">
              <Plane size={22} />
              <span>
                LET’S GO SOMEWHERE
                <br />
                <b>
                  {startDate.replaceAll("-", ".")} —{" "}
                  {endDate.slice(5).replace("-", ".")}
                </b>
              </span>
            </div>
            <button className="text-button" onClick={() => setSettings(true)}>
              <Settings size={17} />
              設定・同期
            </button>
            <span className="side-note">A little trip. A lot of memories.</span>
          </div>
        </aside>
        <div className="main-wrap">
          <header className="topbar">
            <span className="top-breadcrumb">
              OUR LITTLE VIETNAM TRIP <span>/</span> <b>{tab.toUpperCase()}</b>
            </span>
            {!isAdmin && <span className="viewer-pill">閲覧者</span>}
            <div
              className={`connection ${overallStatus === "offline" || overallStatus === "error" ? "offline" : ""}`}
            >
              {online ? <Wifi size={13} /> : <WifiOff size={13} />}
              <button className="sync-badge" onClick={() => setSettings(true)}>
                {overallStatus === "synced"
                  ? "同期済み"
                  : overallStatus === "syncing"
                    ? "同期中"
                    : overallStatus === "offline"
                      ? "オフライン"
                      : "同期エラー"}
              </button>
              <span className="save-state">
                {pendingCount
                  ? `未送信 ${pendingCount}`
                  : overallStatus === "synced"
                    ? "同期済み"
                    : "端末に保存"}
              </span>
            </div>
            <button
              className="mobile-settings icon-button"
              onClick={() => setSettings(true)}
              aria-label="設定"
            >
              <Settings size={19} />
            </button>
          </header>
          <main key={tab}>
            {(overallStatus === "error" || pendingCount > 0) && (
              <div className="sync-warning" role="status">
                <span>
                  {overallStatus === "error"
                    ? syncError
                    : `未送信の変更 ${pendingCount}件。${online ? "同期を待っています。" : "端末に保存しています。再接続後に送信します。"}`}
                </span>
                <button onClick={() => setSettings(true)}>同期を確認</button>
              </div>
            )}
            {tab === "Home" && (
              <>
                <div className="home-greeting">
                  <div>
                    <span className="eyebrow">A LITTLE COLORFUL JOURNEY</span>
                    <h1>
                      Xin chào, Vietnam<span className="red-dot">!</span>
                    </h1>
                    <p>もうすぐ、心ときめくベトナムの旅へ。</p>
                  </div>
                  <span className="edition">
                    TRAVEL JOURNAL
                    <br />
                    <b>VOL. 01 / 2026</b>
                  </span>
                </div>
                <section className="hero">
                  <div className="hero-copy">
                    <span className="hero-kicker">
                      <span /> OUR LITTLE VIETNAM TRIP
                    </span>
                    <h2>
                      HELLO
                      <br />
                      VIETNAM<span>!</span>
                    </h2>
                    <p>
                      おいしい時間も、まだ知らない景色も。
                      <br />
                      私たちだけの、小さな冒険がはじまる。
                    </p>
                    <div className="hero-dates">
                      <CalendarDays size={17} />
                      <b>
                        {startDate.replaceAll("-", ".")}{" "}
                        <span>
                          {new Date(startDate)
                            .toLocaleDateString("en-US", {
                              weekday: "short",
                              timeZone: "UTC",
                            })
                            .toUpperCase()}
                        </span>{" "}
                        — {endDate.slice(5).replace("-", ".")}{" "}
                        <span>
                          {new Date(endDate)
                            .toLocaleDateString("en-US", {
                              weekday: "short",
                              timeZone: "UTC",
                            })
                            .toUpperCase()}
                        </span>
                      </b>
                    </div>
                    <div className="hero-cities">
                      HO CHI MINH <span>→</span> HOI AN <span>→</span> DA NANG
                    </div>
                  </div>
                  <div className="hero-art">
                    <VietnamArt />
                    <span className="art-caption">
                      good food, warm days & little adventures
                    </span>
                  </div>
                  <div className="hero-sticker">
                    3 NIGHTS
                    <br />
                    <b>5 DAYS</b>
                    <span>with you ♡</span>
                  </div>
                </section>
                <div className="home-grid">
                  <section className="countdown-card">
                    <div className="card-eyebrow">
                      {during ? "OUR JOURNEY" : "THE ADVENTURE BEGINS IN"}
                      <Plane size={20} />
                    </div>
                    <div className="countdown-number">
                      {during ? (
                        <>
                          <small>DAY</small>
                          {dayNumber.toString().padStart(2, "0")}
                        </>
                      ) : daysLeft > 0 ? (
                        <>
                          {daysLeft.toString().padStart(2, "0")}
                          <small>days to go</small>
                        </>
                      ) : (
                        <span className="welcome-back">おかえりなさい！</span>
                      )}
                    </div>
                    <p>
                      {during
                        ? "今日も、素敵な旅の1ページを。"
                        : daysLeft > 0
                          ? "旅の準備も、旅の楽しみ。"
                          : "思い出を、いつまでも。"}
                    </p>
                    <div className="countdown-footer">
                      <span>JAPAN STANDARD TIME</span>
                      <span>✦</span>
                    </div>
                  </section>
                  <section className="next-flight card">
                    <div className="section-heading">
                      <h3>
                        Next flight <Plane size={18} />
                      </h3>
                      <button className="text-link" onClick={() => go("Info")}>
                        フライト情報
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    {nextFlight ? (
                      <>
                        <div className="flight-meta">
                          <span>
                            {dateLabel(nextFlight.departure)}（
                            {new Date(
                              nextFlight.departure.slice(0, 10),
                            ).toLocaleDateString("ja-JP", {
                              weekday: "short",
                              timeZone: "UTC",
                            })}
                            ）
                          </span>
                          <span>
                            {nextFlight.airline} · {nextFlight.number}
                          </span>
                        </div>
                        <div className="flight-route">
                          <div>
                            <strong>{nextFlight.from}</strong>
                            <span>
                              {nextFlight.from === "NRT"
                                ? "成田"
                                : nextFlight.from === "SGN"
                                  ? "ホーチミン"
                                  : "ダナン"}
                            </span>
                            <b>{nextFlight.departure.slice(11)}</b>
                          </div>
                          <div className="flight-path">
                            <span />
                            <Plane size={20} />
                            <span />
                          </div>
                          <div>
                            <strong>{nextFlight.to}</strong>
                            <span>
                              {nextFlight.to === "NRT"
                                ? "成田"
                                : nextFlight.to === "SGN"
                                  ? "ホーチミン"
                                  : "ダナン"}
                            </span>
                            <b>{nextFlight.arrival.slice(11)}</b>
                          </div>
                        </div>
                        <div className="flight-foot">
                          <span className="compact-duration">
                            所要 {flightDuration(nextFlight) || "未確認"}
                          </span>
                          <span>現地時刻</span>
                        </div>
                      </>
                    ) : (
                      <p className="empty-inline">
                        次のフライトはありません。
                        <button
                          className="text-link"
                          onClick={() => go("Info")}
                        >
                          フライトを見る
                        </button>
                      </p>
                    )}
                  </section>
                  <section className="packing-preview card">
                    <div className="section-heading">
                      <h3>Ready, set, pack!</h3>
                      <Luggage size={20} />
                    </div>
                    <p>忘れ物のない、軽やかな旅へ。</p>
                    <div className="packing-stat">
                      <strong>
                        {progress}
                        <small>%</small>
                      </strong>
                      <span>
                        {packed} / {data.packing.length} items packed
                      </span>
                    </div>
                    <div className="progress">
                      <span style={{ width: progress + "%" }} />
                    </div>
                    <button
                      className="packing-link"
                      onClick={() => go("Packing")}
                    >
                      持ち物をチェックする
                      <ArrowRight size={18} />
                    </button>
                  </section>
                </div>
                <button
                  className="wallet-shortcut"
                  onClick={() => setWalletOpen(true)}
                >
                  <span className="wallet-shortcut-mark">₫ → ¥</span>
                  <span>
                    <b>今日は、いくら使った？</b>
                    <small>円換算と、自分だけのおこづかい帳</small>
                  </span>
                  <ArrowUpRight size={22} />
                </button>
                <section className="home-lower">
                  <div className="today-section">
                    <div className="section-heading">
                      <h2>
                        {during ? "Today’s plan" : "Our little itinerary"}
                        <span className="small-jp">
                          {during ? "今日の予定" : "旅のはじまり"}
                        </span>
                      </h2>
                      <button
                        className="text-link"
                        onClick={() => go("Schedule")}
                      >
                        すべての予定
                        <ArrowUpRight size={16} />
                      </button>
                    </div>
                    <div className="today-plan">
                      {(during
                        ? todayEvents
                        : data.events
                            .filter((e) => e.date === startDate)
                            .sort((a, b) => a.time.localeCompare(b.time))
                      )
                        .slice(0, 3)
                        .map((e) => (
                          <button
                            key={e.id}
                            className="mini-event"
                            onClick={() => {
                              setDay(e.date);
                              go("Schedule");
                            }}
                          >
                            <span className="mini-time">{e.time}</span>
                            <span
                              className={`category-icon ${e.category.toLowerCase()}`}
                            >
                              <Icon category={e.category} />
                            </span>
                            <span>
                              <b>{e.name}</b>
                              <small>{e.place}</small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      {during && !todayEvents.length && (
                        <p className="empty-inline">
                          今日はまだ予定がありません。自由な時間を楽しもう。
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="destination-teaser">
                    <Flower />
                    <span className="eyebrow">
                      THREE CITIES, SO MANY STORIES
                    </span>
                    <h3>A little wanderlust.</h3>
                    <p>気になる場所を、旅のしおりに。</p>
                    <button onClick={() => go("Places")}>
                      行きたい場所を見る
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                </section>
                <div className="home-footer">
                  <span>MADE FOR OUR LITTLE ADVENTURE</span>
                  <Leaf size={16} />
                  <span>VIETNAM, HERE WE COME.</span>
                </div>
              </>
            )}
            {tab === "Schedule" && (
              <>
                {sectionTitle(
                  "ONE DAY AT A TIME",
                  "Our itinerary",
                  "予定を詰めすぎず、寄り道する余白も。時刻は各地の現地時刻です。",
                )}
                <div className="toolbar">
                  <div className="date-tabs">
                    {tripDays.map((d) => (
                      <button
                        key={d}
                        onClick={() => setDay(d)}
                        className={day === d ? "selected" : ""}
                      >
                        <small>
                          {new Date(d)
                            .toLocaleDateString("en-US", {
                              month: "short",
                              timeZone: "UTC",
                            })
                            .toUpperCase()}
                        </small>
                        <b>{Number(d.slice(-2))}</b>
                        <span>
                          {new Date(d).toLocaleDateString("ja-JP", {
                            weekday: "short",
                            timeZone: "UTC",
                          })}
                        </span>
                      </button>
                    ))}
                  </div>
                  {isAdmin && (
                    <button
                      data-admin="true"
                      className="primary"
                      onClick={() => open("events")}
                    >
                      <Plus size={18} />
                      予定を追加
                    </button>
                  )}
                </div>
                <div className="schedule-heading">
                  <div>
                    <Tag>DAY {tripDays.indexOf(day) + 1}</Tag>
                    <h2>{dateLabel(day)} のプラン</h2>
                  </div>
                  <label className="sort-label">
                    並び順
                    <select
                      value={sort}
                      onChange={(e) =>
                        setSort(e.target.value as "time" | "custom")
                      }
                    >
                      <option value="time">時刻順</option>
                      <option value="custom">カスタム</option>
                    </select>
                  </label>
                </div>
                <div className="timeline">
                  {data.events
                    .filter((e) => e.date === day)
                    .sort((a, b) =>
                      sort === "time"
                        ? a.time.localeCompare(b.time)
                        : a.order - b.order,
                    )
                    .map((e) => (
                      <div
                        className={`timeline-row ${e.done ? "completed" : ""}`}
                        key={e.id}
                      >
                        <div className="timeline-time">
                          {e.time}
                          <small>{e.end}</small>
                        </div>
                        <div
                          className={`timeline-dot ${e.category.toLowerCase()}`}
                        >
                          <Icon category={e.category} />
                        </div>
                        <article className="event-card">
                          <div className="event-top">
                            <span className="category-label">{e.category}</span>
                            {overlaps(e) && (
                              <span className="overlap">時間の重複あり</span>
                            )}
                            {isAdmin && !e.flightId && !e.hotelId && (
                              <button
                                className={`check-button ${e.done ? "checked" : ""}`}
                                aria-label={
                                  e.done ? "未完了に戻す" : "予定を完了にする"
                                }
                                onClick={() =>
                                  update("events", e.id, { done: !e.done })
                                }
                              >
                                {e.done && <Check size={15} />}
                              </button>
                            )}
                          </div>
                          <h3>{e.name}</h3>
                          <p className="location">
                            <MapPin size={14} />
                            {e.place || "場所未登録"}
                          </p>
                          {e.memo && <p className="memo">{e.memo}</p>}
                          <div className="event-actions">
                            {isAdmin && (
                              <button
                                onClick={() =>
                                  e.hotelId
                                    ? open(
                                        "hotels",
                                        data.hotels.find(
                                          (h) => h.id === e.hotelId,
                                        ),
                                      )
                                    : e.flightId
                                      ? open(
                                          "flights",
                                          data.flights.find(
                                            (f) => f.id === e.flightId,
                                          ),
                                        )
                                      : open("events", e)
                                }
                              >
                                <Pencil size={14} />
                                編集
                              </button>
                            )}
                            {(e.place || e.mapUrl) && (
                              <button
                                onClick={() =>
                                  external(
                                    e.mapUrl ||
                                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.place)}`,
                                  )
                                }
                              >
                                <MapPin size={14} />
                                マップ
                              </button>
                            )}
                            {e.url && (
                              <button onClick={() => external(e.url)}>
                                <ExternalLink size={14} />
                                リンク
                              </button>
                            )}
                            {isAdmin && sort === "custom" && (
                              <>
                                <button
                                  aria-label="前へ移動"
                                  onClick={() => move(e, -1)}
                                >
                                  <ArrowUp size={15} />
                                </button>
                                <button
                                  aria-label="後ろへ移動"
                                  onClick={() => move(e, 1)}
                                >
                                  <ArrowDown size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </article>
                      </div>
                    ))}
                </div>
                {!data.events.some((e) => e.date === day) && (
                  <div className="empty-state">
                    <Sun />
                    <h3>余白も、旅の楽しみ。</h3>
                    <p>この日の予定を追加しましょう。</p>
                    {isAdmin && (
                      <button
                        data-admin="true"
                        className="primary"
                        onClick={() => open("events")}
                      >
                        <Plus size={18} />
                        予定を追加
                      </button>
                    )}
                  </div>
                )}
                <p className="help-text">
                  フライトの編集は「旅の情報」と連動します。共有情報の編集は管理者専用です。
                </p>
              </>
            )}
            {tab === "Packing" && (
              <>
                {sectionTitle(
                  "A LITTLE PREPARATION",
                  "Ready, set, pack!",
                  "身軽に、でも大切なものは忘れずに。ふたりそれぞれの、旅じたく。",
                )}
                <div className="packing-banner">
                  <Luggage size={40} />
                  <div>
                    <b>
                      {packed} / {data.packing.length} items
                    </b>
                    <p>
                      {progress === 100
                        ? "準備完了！いってらっしゃい。"
                        : "チェックはあなた専用。相手のチェックには影響しません。"}
                    </p>
                    <div className="progress">
                      <span style={{ width: progress + "%" }} />
                    </div>
                  </div>
                  <strong>
                    {progress}
                    <small>%</small>
                  </strong>
                </div>
                <div className="toolbar">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={pendingOnly}
                      onChange={(e) => setPendingOnly(e.target.checked)}
                    />
                    未準備だけ表示
                  </label>
                  {isAdmin && (
                    <button
                      data-admin="true"
                      className="primary"
                      onClick={() => open("packing")}
                    >
                      <Plus size={18} />
                      持ち物を追加
                    </button>
                  )}
                </div>
                <div className="packing-grid">
                  {packingCategories.map((c, i) => {
                    const items = data.packing.filter(
                      (p) => p.category === c && (!pendingOnly || !p.done),
                    );
                    return (
                      <section key={c} className="packing-group">
                        <h3>
                          <span className="group-index">0{i + 1}</span>
                          {c}
                          <small>
                            {
                              data.packing.filter(
                                (x) => x.category === c && x.done,
                              ).length
                            }
                            /
                            {
                              data.packing.filter((x) => x.category === c)
                                .length
                            }
                          </small>
                        </h3>
                        {items.map((p) => (
                          <div
                            className={`packing-item ${p.done ? "completed" : ""}`}
                            key={p.id}
                          >
                            <button
                              className={`check-button ${p.done ? "checked" : ""}`}
                              onClick={() =>
                                update("packing", p.id, { done: !p.done })
                              }
                              aria-label={`${p.name}を${p.done ? "未準備" : "準備済み"}にする`}
                            >
                              {p.done && <Check size={14} />}
                            </button>
                            <span>{p.name}</span>
                            <small>×{p.quantity}</small>
                            {isAdmin && (
                              <button
                                className="icon-button"
                                aria-label={`${p.name}を編集`}
                                onClick={() => open("packing", p)}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        {!items.length && (
                          <p className="empty-inline">
                            {pendingOnly
                              ? "このカテゴリーは準備できています。"
                              : "項目がありません。"}
                          </p>
                        )}
                      </section>
                    );
                  })}
                </div>
                <p className="help-text">
                  預け入れ荷物ありのリストです。液体・バッテリー等の持ち込み条件は利用航空会社で確認してください。
                </p>
              </>
            )}
            {tab === "Places" && (
              <>
                {sectionTitle(
                  "SAVE A LITTLE WANDERLUST",
                  "Places to go",
                  "気になるカフェも、忘れたくない景色も。",
                )}
                <div className="toolbar places-toolbar">
                  <div className="filter-tabs">
                    {["すべて", ...cities].map((c) => (
                      <button
                        className={city === c ? "selected" : ""}
                        key={c}
                        onClick={() => setCity(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {isAdmin && (
                    <button
                      data-admin="true"
                      className="primary"
                      onClick={() => open("places")}
                    >
                      <Plus size={18} />
                      場所を追加
                    </button>
                  )}
                </div>
                <label className="search">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="名前・住所・メモから検索"
                  />
                </label>
                <div className="places-grid">
                  {data.places
                    .filter(
                      (p) =>
                        (city === "すべて" || city === p.city) &&
                        `${p.name} ${p.address} ${p.memo}`.includes(query),
                    )
                    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
                    .map((p, i) => (
                      <article
                        key={p.id}
                        className={`place-card ${p.visited ? "visited" : ""}`}
                      >
                        <div className={`place-art art-${i % 3}`}>
                          <PlacePhoto
                            path={p.photoPath}
                            placeId={p.id}
                            name={p.name}
                            identity={view.identity}
                            fallback={
                              <>
                                <Icon category={p.category} size={58} />
                                <span>
                                  {p.city === "ホーチミン"
                                    ? "SAIGON"
                                    : p.city === "ホイアン"
                                      ? "HOI AN"
                                      : "DA NANG"}
                                </span>
                              </>
                            }
                            onError={setError}
                            onSave={async (path) => {
                              if (!engine.active)
                                throw new Error("ログインし直してください。");
                              const current = dataRef.current;
                              if (
                                !current.places.some(
                                  (place) => place.id === p.id,
                                )
                              )
                                throw new Error("この場所は削除されています。");
                              await engine.edit({
                                ...current,
                                places: current.places.map((place) =>
                                  place.id === p.id
                                    ? { ...place, photoPath: path }
                                    : place,
                                ),
                              });
                              setNotice("写真を保存しました。自動同期します。");
                            }}
                          />
                          {isAdmin && (
                            <button
                              className={`favorite icon-button ${p.favorite ? "is-favorite" : ""}`}
                              onClick={() =>
                                update("places", p.id, {
                                  favorite: !p.favorite,
                                })
                              }
                              aria-label="お気に入り切り替え"
                            >
                              <Heart
                                size={21}
                                fill={p.favorite ? "currentColor" : "none"}
                              />
                            </button>
                          )}
                        </div>
                        <div className="place-body">
                          <div className="place-meta">
                            <Tag>{p.city}</Tag>
                            <span>{p.category}</span>
                          </div>
                          <h3>{p.name}</h3>
                          <p className="address">
                            <MapPin size={14} />
                            {p.address || "住所未登録"}
                          </p>
                          <p className="memo">{p.memo}</p>
                          <div className="place-actions">
                            <button
                              className="map-button"
                              onClick={() => map(p)}
                            >
                              <MapPin size={15} />
                              マップ
                              <ArrowUpRight size={15} />
                            </button>
                            {isAdmin && (
                              <button
                                data-admin="true"
                                className="icon-button"
                                aria-label="場所を編集"
                                onClick={() => open("places", p)}
                              >
                                <Pencil size={17} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                className="icon-button"
                                aria-label="スケジュールに追加"
                                onClick={() => {
                                  open("events");
                                  setEditor({
                                    kind: "events",
                                    fresh: true,
                                    value: {
                                      id: uid(),
                                      date: day,
                                      time: "12:00",
                                      end: "13:00",
                                      name: p.name,
                                      category: p.category,
                                      place: p.address || p.name,
                                      mapUrl: p.url,
                                      memo: p.memo,
                                      url: p.url,
                                      done: false,
                                      order: data.events.length,
                                    },
                                  });
                                }}
                              >
                                <CalendarDays size={18} />
                              </button>
                            )}
                            <button
                              disabled={!isAdmin}
                              className={`visited-button ${p.visited ? "checked" : ""}`}
                              onClick={() =>
                                update("places", p.id, { visited: !p.visited })
                              }
                            >
                              <CheckCircle2 size={16} />
                              {p.visited ? "訪問済み" : "未訪問"}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
                {!data.places.filter(
                  (p) =>
                    (city === "すべて" || p.city === city) &&
                    `${p.name} ${p.address} ${p.memo}`.includes(query),
                ).length && (
                  <div className="empty-state">
                    <MapPin />
                    <h3>新しい寄り道を見つけよう。</h3>
                    <p>条件に合う場所はまだありません。</p>
                  </div>
                )}
                <div className="offline-note">
                  <MapPin size={23} />
                  <div>
                    <b>地図も、出発前のひと準備。</b>
                    <p>
                      Googleマップアプリの「オフラインマップ」から事前に地図をダウンロードしてください。このアプリは地図画像を保存せず、住所・メモ・登録した位置情報をオフラインで表示します。外部マップには接続が必要です。
                    </p>
                  </div>
                </div>
              </>
            )}
            {tab === "Info" && (
              <>
                {sectionTitle(
                  "THE LITTLE ESSENTIALS",
                  "Travel essentials",
                  "フライトも、予約も。大切な情報をひとつに。",
                )}
                <MoneyPanel engine={money} />
                <div className="section-heading info-heading">
                  <h2>
                    <Plane size={22} />
                    Our flights
                  </h2>
                  {isAdmin && (
                    <button
                      data-admin="true"
                      className="primary"
                      onClick={() => open("flights")}
                    >
                      <Plus size={16} />
                      フライトを追加
                    </button>
                  )}
                </div>
                <div className="flights-list">
                  {data.flights.map((f) => (
                    <article className="full-flight card" key={f.id}>
                      <div className="section-heading">
                        <div>
                          <Tag>{dateLabel(f.departure)}</Tag>
                          <b className="airline">
                            {f.airline} · {f.number}
                          </b>
                        </div>
                        {isAdmin && (
                          <button
                            data-admin="true"
                            className="text-link"
                            onClick={() => open("flights", f)}
                          >
                            <Pencil size={15} />
                            編集
                          </button>
                        )}
                      </div>
                      <div className="flight-route">
                        <FlightEndpoint
                          airport={f.from}
                          at={f.departure}
                          label="出発"
                        />
                        <div className="flight-connection">
                          <div className="flight-path">
                            <span />
                            <Plane size={22} />
                            <span />
                          </div>
                          <div
                            className="flight-duration"
                            title="各空港の時差を考慮した出発〜到着の時間です。乗継をまとめて登録した場合は待ち時間も含みます。"
                          >
                            <span>所要時間</span>
                            <b>{flightDuration(f) || "未確認"}</b>
                          </div>
                        </div>
                        <FlightEndpoint
                          airport={f.to}
                          at={f.arrival}
                          label="到着"
                        />
                      </div>
                      <div className="flight-details">
                        <span>予約番号：{f.booking || "未登録"}</span>
                        <span>預け入れ：{f.checked || "要確認"}</span>
                        <span>機内持込：{f.cabin || "要確認"}</span>
                      </div>
                      {f.memo && <p className="memo">{f.memo}</p>}
                      <div className="ticket-link">
                        <button
                          className="secondary"
                          disabled={!f.url || !online}
                          onClick={() => external(f.url)}
                        >
                          <ExternalLink size={15} />
                          航空券を確認
                        </button>
                        <p>
                          {f.url ? (
                            <>
                              <span>保存済みURL：</span>
                              <span className="saved-url">{f.url}</span>
                            </>
                          ) : (
                            "航空券URLは未登録です。管理者が編集画面から登録できます。"
                          )}
                        </p>
                        <small>
                          航空会社・旅行会社のページを開くにはオンライン接続が必要です。
                        </small>
                      </div>
                      <small className="local-time">
                        時刻は各空港の現地時刻 /
                        NRT：日本時間、SGN・DAD：ベトナム時間
                      </small>
                    </article>
                  ))}
                </div>
                <div className="section-heading info-heading">
                  <h2>
                    <Hotel size={22} />
                    Our stays
                  </h2>
                  {isAdmin && (
                    <button className="primary" onClick={() => open("hotels")}>
                      <Plus size={16} />
                      ホテルを追加
                    </button>
                  )}
                </div>
                <div className="notes-grid hotel-grid">
                  {data.hotels.map((h) => (
                    <article className="note-card hotel-card" key={h.id}>
                      <div className="section-heading">
                        <Tag>{h.city}</Tag>
                        {isAdmin && (
                          <button
                            className="icon-button"
                            aria-label="ホテルを編集"
                            onClick={() => open("hotels", h)}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </div>
                      <h3>{h.name}</h3>
                      <div className="hotel-dates">
                        <div className="stay-datetime">
                          <span className="stay-label">チェックイン</span>
                          <ReadableDateTime at={h.checkin} />
                        </div>
                        <ArrowRight size={18} />
                        <div className="stay-datetime">
                          <span className="stay-label">チェックアウト</span>
                          <ReadableDateTime at={h.checkout} />
                        </div>
                      </div>
                      <p className="address">
                        <MapPin size={14} />
                        {h.address || "住所未登録"}
                      </p>
                      <p>
                        予約番号：{h.booking || "未登録"}
                        <br />
                        電話番号：{h.phone || "未登録"}
                      </p>
                      {h.memo && <p>{h.memo}</p>}
                      <div className="event-actions">
                        <button
                          onClick={() =>
                            external(
                              h.mapUrl ||
                                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.name + " " + h.address)}`,
                            )
                          }
                        >
                          <MapPin size={15} />
                          Googleマップで見る
                        </button>
                        <button
                          disabled={!h.url || !online}
                          onClick={() => external(h.url)}
                        >
                          <ExternalLink size={15} />
                          予約情報を確認
                        </button>
                      </div>
                      {h.url && <p className="saved-url">{h.url}</p>}
                      <small className="help-text">
                        外部ページの閲覧には接続が必要です。
                      </small>
                    </article>
                  ))}
                </div>
                {!data.hotels.length && (
                  <p className="empty-inline">
                    ホテルはまだ登録されていません。
                  </p>
                )}
                <div className="section-heading info-heading">
                  <h2>
                    <FileText size={21} />
                    Notes & reservations
                  </h2>
                  {isAdmin && (
                    <button
                      data-admin="true"
                      className="text-link"
                      onClick={() => open("notes")}
                    >
                      <Plus size={17} />
                      情報を追加
                    </button>
                  )}
                </div>
                <div className="notes-grid">
                  {data.notes.map((n) => (
                    <article className="note-card" key={n.id}>
                      <div className="section-heading">
                        <Tag>{n.category}</Tag>
                        {isAdmin && (
                          <button
                            data-admin="true"
                            className="icon-button"
                            aria-label="情報を編集"
                            onClick={() => open("notes", n)}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </div>
                      <h3>{n.name}</h3>
                      <p>{n.memo}</p>
                      {n.url && (
                        <button
                          className="text-link"
                          onClick={() => external(n.url)}
                        >
                          予約・関連リンク
                          <ArrowUpRight size={15} />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
                <div className="offline-note">
                  <Luggage size={23} />
                  <div>
                    <b>旅の情報は、この端末の中に。</b>
                    <p>
                      フライト・ホテル・住所・メモはオフラインで確認できます。航空券・予約・地図の外部ページには接続が必要です。旅行データはSupabaseとこの端末に保存されます。端末の保存領域は暗号化された金庫ではありません。パスポート番号・決済情報は保存しないでください。
                    </p>
                  </div>
                </div>
                <button
                  className="settings-entry"
                  onClick={() => setSettings(true)}
                >
                  <Settings size={19} />
                  設定・同期
                  <ChevronRight size={18} />
                </button>
              </>
            )}
          </main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="メインナビゲーション">
        {nav.map((n) => (
          <button
            className={tab === n.name ? "active" : ""}
            key={n.name}
            onClick={() => go(n.name)}
          >
            <n.icon size={21} />
            <span>{n.name}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="閉じる">
            <X size={18} />
          </button>
        </div>
      )}
      {walletOpen && (
        <Modal title="旅のおこづかい帳" close={() => setWalletOpen(false)}>
          <div className="wallet-modal">
            <MoneyPanel engine={money} />
          </div>
        </Modal>
      )}
      {editor && (
        <Modal
          title={
            {
              events: "予定",
              packing: "持ち物",
              places: "場所",
              flights: "フライト",
              hotels: "ホテル",
              notes: "旅の情報",
            }[editor.kind] + (editor.fresh ? "を追加" : "を編集")
          }
          close={() => setEditor(undefined)}
        >
          <form onSubmit={saveEditor}>
            <EditorFields
              tripDays={tripDays}
              editor={editor}
              set={(v) =>
                setEditor((current) =>
                  current
                    ? { ...current, value: { ...current.value, ...v } }
                    : current,
                )
              }
            />
            <div className="form-actions">
              {!editor.fresh && (
                <button
                  type="button"
                  className="danger text-button"
                  onClick={remove}
                >
                  <Trash2 size={17} />
                  削除
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => setEditor(undefined)}
              >
                キャンセル
              </button>
              <button className="primary" type="submit">
                <Check size={17} />
                保存する
              </button>
            </div>
          </form>
        </Modal>
      )}
      {settings && (
        <Modal title="設定・同期" close={() => setSettings(false)}>
          <div className="settings-content">
            <span className="eyebrow">JUST THE TWO OF US</span>
            <h3>ふたりの旅を、いつも一緒に。</h3>
            <div className="account-info">
              <Tag>{isAdmin ? "ADMIN / 管理者" : "VIEWER / 閲覧者"}</Tag>
              <p>{view.identity.email}</p>
              <small>権限はSupabase側で管理されます。</small>
            </div>
            <div className="sync-detail">
              <b>
                {overallStatus === "synced"
                  ? "同期済み"
                  : overallStatus === "syncing"
                    ? "同期中"
                    : overallStatus === "offline"
                      ? "オフライン"
                      : "同期エラー"}
              </b>
              <p>
                最終同期：
                {view.lastSync
                  ? new Date(view.lastSync).toLocaleString("ja-JP", {
                      timeZone: "Asia/Tokyo",
                    }) + "（日本時間）"
                  : "まだ同期していません"}
                <br />
                未送信の変更：{pendingCount}件
              </p>
              {syncError && <p role="alert">{syncError}</p>}
              <button
                className="secondary"
                disabled={!online || overallStatus === "syncing"}
                onClick={() => {
                  void engine.retry();
                  void money.retry();
                }}
              >
                再同期する
              </button>
            </div>
            <div className="install-guide">
              <h4>ホーム画面に、旅のしおりを。</h4>
              <p>
                iPhoneのSafariで開き、共有
                →「ホーム画面に追加」を選択してください。一度ログインして取得した情報は、オフライン起動でも確認できます。
              </p>
            </div>
            <p className="help-text">
              持ち物のチェックは自分専用です。オフラインの変更は端末内に保持され、再接続時に認証・権限を確認して送信します。競合は確認するまで上書きしません。
              <br />
              ログアウトすると、この端末の全アカウントの旅行キャッシュと未送信データを削除します。共有端末では必ずログアウトしてください。ブラウザのデータ削除で未送信の変更は失われるため、接続できるときに同期を確認してください。
            </p>
            <button
              className="danger text-button"
              onClick={() =>
                setConfirmAction({
                  title: pendingCount
                    ? `未送信の変更が${pendingCount}件あります。ログアウトすると端末内の旅行情報・未送信の変更を削除します。続けますか？`
                    : "ログアウトし、端末内の旅行情報を削除しますか？",
                  run: () => {
                    void logout().catch(() =>
                      setError(
                        "ログアウト処理を確認できませんでした。再度お試しください。",
                      ),
                    );
                    setConfirmAction(undefined);
                  },
                })
              }
            >
              ログアウト・端末キャッシュ削除
            </button>
          </div>
        </Modal>
      )}
      {view.conflict && (
        <Modal title="更新の競合を確認" close={() => {}}>
          <div className="conflict-content">
            <p>
              別の端末の更新と、この端末の未送信の変更があります。採用する内容を確認してください。
            </p>
            {view.conflict.kind === "shared" ? (
              <div className="conflict-compare">
                <div>
                  <h3>この端末の未送信の内容</h3>
                  <SharedSummary data={view.conflict.local as SharedState} />
                </div>
                <div>
                  <h3>サーバーの最新の内容</h3>
                  <SharedSummary data={view.conflict.remote as SharedState} />
                </div>
              </div>
            ) : (
              <p>
                持ち物：
                {data.packing.find((p) => p.id === view.conflict?.itemId)
                  ?.name ?? "削除された項目"}
                <br />
                この端末：{view.conflict.local ? "準備済み" : "未準備"} /
                サーバー：{view.conflict.remote ? "準備済み" : "未準備"}
              </p>
            )}
            <p className="help-text">
              「この端末を採用」は上記の端末内の内容でサーバーを更新します。「サーバーを採用」は該当する未送信の変更を破棄します。他の未送信変更は保持します。
            </p>
            <div className="form-actions">
              <button
                className="secondary"
                onClick={() =>
                  void engine
                    .resolve("remote")
                    .catch(() => setError("競合を解消できませんでした。"))
                }
              >
                サーバーを採用
              </button>
              <button
                className="primary"
                disabled={view.conflict.missing}
                onClick={() =>
                  void engine
                    .resolve("local")
                    .catch(() => setError("競合を解消できませんでした。"))
                }
              >
                この端末を採用
              </button>
            </div>
          </div>
        </Modal>
      )}
      {confirmAction && (
        <Modal title="確認" close={() => setConfirmAction(undefined)} compact>
          <p className="confirm-message">{confirmAction.title}</p>
          <div className="form-actions">
            <button
              className="secondary"
              onClick={() => setConfirmAction(undefined)}
            >
              キャンセル
            </button>
            <button className="primary" onClick={confirmAction.run}>
              実行する
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Modal({
  title,
  close,
  children,
  compact = false,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = ref.current;
    const focusables = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        ) ?? [],
      ).filter((x) => !x.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
      if (e.key === "Tab") {
        const items = focusables(),
          first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el?.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = old;
      el?.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className={`modal ${compact ? "compact" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="閉じる">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function EditorFields({
  editor,
  set,
  tripDays,
}: {
  editor: Editor;
  set: (patch: any) => void;
  tripDays: string[];
}) {
  const { kind, value: v } = editor;
  const input = (
    key: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label className="field" key={key}>
      {label}
      <input
        type={type}
        required={required}
        value={v[key] ?? ""}
        maxLength={type === "text" ? 500 : undefined}
        min={type === "number" ? 1 : undefined}
        max={type === "number" ? 999 : undefined}
        onInput={(e) =>
          set({
            [key]:
              type === "number"
                ? Number(e.currentTarget.value)
                : e.currentTarget.value,
          })
        }
      />
    </label>
  );
  const select = (key: string, label: string, items: string[]) => (
    <label className="field" key={key}>
      {label}
      <select value={v[key]} onChange={(e) => set({ [key]: e.target.value })}>
        {items.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  );
  const memo = (
    <label className="field">
      メモ
      <textarea
        rows={4}
        maxLength={10000}
        value={v.memo}
        onChange={(e) => set({ memo: e.target.value })}
      />
    </label>
  );
  return (
    <div className="fields">
      {kind !== "flights" &&
        input(
          "name",
          kind === "packing" ? "持ち物の名前" : "名前",
          "text",
          true,
        )}
      {kind === "events" && (
        <>
          <label className="field">
            日付
            <select
              value={v.date}
              onChange={(e) => set({ date: e.target.value })}
            >
              {tripDays.map((d) => (
                <option key={d} value={d}>
                  {dateLabel(d)}
                </option>
              ))}
            </select>
          </label>
          <div className="field-pair">
            {input("time", "開始時刻", "time", true)}
            {input("end", "終了時刻", "time")}
          </div>
          {select("category", "カテゴリー", categories)}
          {input("place", "場所・住所")}
          {input("mapUrl", "GoogleマップURL", "url")}
          {memo}
          {input("url", "関連URL", "url")}
        </>
      )}
      {kind === "packing" && (
        <>
          {select("category", "カテゴリー", packingCategories)}
          {input("quantity", "数量", "number", true)}
        </>
      )}
      {kind === "places" && (
        <>
          <div className="field-pair">
            {select("city", "都市", cities)}
            {select("category", "カテゴリー", categories)}
          </div>
          {input("address", "住所")}
          {memo}
          {input("url", "GoogleマップURL", "url")}
        </>
      )}
      {kind === "flights" && (
        <>
          <div className="field-pair">
            {input("airline", "航空会社", "text", true)}
            {input("number", "便名", "text", true)}
          </div>
          <div className="field-pair">
            {input("from", "出発空港（例：NRT）", "text", true)}
            {input("to", "到着空港（例：SGN）", "text", true)}
          </div>
          {input("departure", "出発日時（現地時刻）", "datetime-local", true)}
          {input("arrival", "到着日時（現地時刻）", "datetime-local", true)}
          {input("booking", "予約番号")}
          {input("url", "航空券確認ページURL", "url")}
          <div className="field-pair">
            {input("checked", "預け入れ荷物（例：20 kg）")}
            {input("cabin", "機内持込（例：7 kg）")}
          </div>
          {memo}
          <p className="help-text">
            変更はスケジュールにも反映します。航空券はHTTPSの確認ページURLで管理します。ページの閲覧には接続が必要です。出発・到着の各空港の現地時刻を入力してください。空港コードから時差を判定し、所要時間を計算します。未対応の空港は「所要時間：未確認」と表示します。
          </p>
        </>
      )}
      {kind === "hotels" && (
        <>
          {select("city", "宿泊都市", cities)}
          {input("checkin", "チェックイン（現地時刻・任意）", "datetime-local")}
          {input(
            "checkout",
            "チェックアウト（現地時刻・任意）",
            "datetime-local",
          )}
          {input("address", "住所")}
          {input("mapUrl", "GoogleマップURL", "url")}
          {input("url", "予約確認ページURL", "url")}
          {input("booking", "予約番号（任意）")}
          {input("phone", "電話番号", "tel")}
          {memo}
        </>
      )}
      {kind === "notes" && (
        <>
          {select("category", "カテゴリー", [
            "ホテル",
            "予約リンク",
            "緊急連絡先",
            "通貨",
            "旅行保険",
            "その他メモ",
          ])}
          {memo}
          {input("url", "関連URL", "url")}
        </>
      )}
    </div>
  );
}

function SharedSummary({ data }: { data: SharedState }) {
  return (
    <div className="shared-summary">
      {(Object.keys(data) as (keyof SharedState)[]).map((k) => (
        <details key={k}>
          <summary>
            {
              {
                events: "予定",
                packing: "持ち物",
                places: "場所",
                flights: "フライト",
                hotels: "ホテル",
                notes: "メモ",
              }[k]
            }
            ：{data[k].length}件
          </summary>
          {data[k].map((r) => (
            <div key={r.id}>
              <b>{"name" in r ? r.name : "number" in r ? r.number : ""}</b>
              <dl>
                {Object.entries(r)
                  .filter(([key]) => key !== "id" && key !== "name")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          ))}
        </details>
      ))}
    </div>
  );
}

function ReadableDateTime({ at }: { at: string }) {
  if (!at) return <span className="datetime-unknown">未確認</span>;
  const date = at.slice(0, 10);
  const weekday = new Date(date + "T00:00:00Z").toLocaleDateString("ja-JP", {
    weekday: "long",
    timeZone: "UTC",
  });
  return (
    <time className="readable-datetime" dateTime={at}>
      <b className="readable-time">{at.slice(11, 16)}</b>
      <span className="readable-date">{date.replaceAll("-", ".")}</span>
      <span className="readable-weekday">{weekday}</span>
    </time>
  );
}
function FlightEndpoint({
  airport,
  at,
  label,
}: {
  airport: string;
  at: string;
  label: string;
}) {
  return (
    <div className="flight-endpoint">
      <span className="flight-direction">{label}</span>
      <strong>{airport}</strong>
      <ReadableDateTime at={at} />
      <span className="airport-timezone">
        {airportZone(airport)?.label || "現地時刻（時差未確認）"}
      </span>
    </div>
  );
}

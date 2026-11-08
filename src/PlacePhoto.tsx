import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, WifiOff } from "lucide-react";
import { db, scopeFor, uid, type Identity } from "./data";
import { supabase, verifiedIdentity } from "./supabase";
const BUCKET = "place-photos";
export async function compressPhoto(file: File): Promise<Blob> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("20MB以下の写真を選んでください。");
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    throw new Error("JPEG・PNG・WebPなどの写真を選んでください。");
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    const ratio = Math.min(
      1,
      1400 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("canvas");
    ctx.fillStyle = "#fff8ed";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(Error("encode"))),
          "image/jpeg",
          quality,
        ),
      );
    let blob = await encode(0.82);
    if (blob.size > 512 * 1024) blob = await encode(0.58);
    if (blob.size > 1024 * 1024)
      throw new Error("写真を小さくしてから、もう一度お試しください。");
    return blob;
  } catch (e) {
    if (e instanceof Error && e.message.includes("写真")) throw e;
    throw new Error("写真を読み込めません。JPEG・PNG形式でお試しください。");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export default function PlacePhoto({
  path,
  placeId,
  name,
  identity,
  fallback,
  onSave,
  onError,
}: {
  path?: string;
  placeId: string;
  name: string;
  identity: Identity;
  fallback: ReactNode;
  onSave: (path: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [src, setSrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const alive = useRef(true);
  const scope = scopeFor(identity);
  const admin = identity.role === "admin";
  useEffect(() => {
    alive.current = true;
    const network = () => setOnline(navigator.onLine);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      alive.current = false;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  useEffect(() => {
    let active = true;
    let objectURL = "";
    setSrc("");
    setFailed(false);
    if (!path) return;
    const key = scope + ":" + path;
    (async () => {
      try {
        const cached = await db.photos.get(key);
        let blob = cached?.blob;
        if (!blob && navigator.onLine) {
          if (!path.startsWith(identity.tripId + "/")) throw Error("path");
          const { data, error } = await supabase!.storage
            .from(BUCKET)
            .download(path);
          if (error || !data) throw Error("download");
          blob = data;
          if (active && alive.current)
            await db.photos.put({ key, scope, path, blob }).catch(() => {});
        }
        if (!active) return;
        if (blob) {
          objectURL = URL.createObjectURL(blob);
          setSrc(objectURL);
        } else setFailed(true);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [path, scope, online, identity.tripId]);
  async function choose(file?: File) {
    if (!file || busy) return;
    if (!navigator.onLine) {
      onError("写真の登録にはインターネット接続が必要です。");
      return;
    }
    setBusy(true);
    try {
      const user = await verifiedIdentity();
      if (
        user.role !== "admin" ||
        user.userId !== identity.userId ||
        user.tripId !== identity.tripId
      )
        throw new Error("写真を変更できるのは管理者だけです。");
      const blob = await compressPhoto(file);
      const photoPath = `${identity.tripId}/${placeId}/${uid()}.jpg`;
      const { error } = await supabase!.storage
        .from(BUCKET)
        .upload(photoPath, blob, {
          contentType: "image/jpeg",
          upsert: false,
          cacheControl: "0",
        });
      if (error)
        throw new Error(
          "写真を保存できません。接続・保存容量・写真ストレージの設定を確認してください。",
        );
      if (!alive.current) return;
      await onSave(photoPath);
      if (alive.current)
        await db.photos
          .put({ key: scope + ":" + photoPath, scope, path: photoPath, blob })
          .catch(() => {});
    } catch (e) {
      if (alive.current)
        onError(
          e instanceof Error ? e.message : "写真を保存できませんでした。",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const content = (
    <>
      {src ? (
        <img src={src} alt={`${name}の写真`} loading="lazy" />
      ) : (
        <div className="place-photo-fallback">{fallback}</div>
      )}
      {busy && (
        <span className="photo-busy" role="status">
          <LoaderCircle size={22} />
          写真を保存中…
        </span>
      )}
      {!admin && failed && path && (
        <span className="photo-hint">
          <WifiOff size={14} />
          写真は接続時に取得
        </span>
      )}
    </>
  );
  return admin ? (
    <>
      <label
        className={`place-photo ${busy ? "is-busy" : ""}`}
        aria-label={`${name}の写真を${path ? "変更" : "登録"}`}
      >
        {content}
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {path && (
        <button
          className="photo-clear"
          disabled={busy}
          onClick={() =>
            void onSave("").catch(() =>
              onError("写真の表示を解除できませんでした。"),
            )
          }
        >
          写真を外す
        </button>
      )}
    </>
  ) : (
    <div className="place-photo">{content}</div>
  );
}

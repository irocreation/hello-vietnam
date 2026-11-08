import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";
let needsRefresh = false;
const listeners = new Set<() => void>();
const update = registerSW({
  immediate: true,
  onNeedRefresh() {
    needsRefresh = true;
    listeners.forEach((fn) => fn());
  },
});
export function PwaUpdate() {
  const show = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => needsRefresh,
  );
  if (!show) return null;
  return (
    <div className="pwa-update" role="status">
      <span>
        新しいバージョンがあります。編集中の内容を保存してから更新してください。
      </span>
      <button onClick={() => update(true)}>更新する</button>
    </div>
  );
}

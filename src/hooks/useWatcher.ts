import { useEffect, useRef } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { onFileChange, type WatcherChange } from "@/ipc/watcher";

type Options = { enabled?: boolean };

export function useWatcher(
  handler: (change: WatcherChange) => void,
  options?: Options,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void onFileChange((change) => handlerRef.current(change)).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      cancelled = true;
      if (unlisten !== null) unlisten();
    };
  }, [enabled]);
}

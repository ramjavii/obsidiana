import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type WatcherChange =
  | { kind: "changed"; path: string }
  | { kind: "deleted"; path: string };

export const WATCHER_EVENT = "obsidiana://fs-change";

export async function onFileChange(
  handler: (change: WatcherChange) => void,
): Promise<UnlistenFn> {
  return listen<WatcherChange>(WATCHER_EVENT, (event) => {
    handler(event.payload);
  });
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useWatcher } from "@/hooks/useWatcher";
import type { UnlistenFn } from "@tauri-apps/api/event";

type ListenHandler = (event: { payload: { kind: "changed" | "deleted"; path: string } }) => void;

interface MockRegistry {
  trigger: (payload: { kind: "changed" | "deleted"; path: string }) => void;
  calls: Array<{ event: string; handler: ListenHandler }>;
}

const registry: MockRegistry = { trigger: () => undefined, calls: [] };

vi.mock("@/ipc/watcher", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ipc/watcher")>();
  return {
    ...actual,
    onFileChange: vi.fn(
      (
        handler: (c: { kind: "changed" | "deleted"; path: string }) => void,
      ): Promise<UnlistenFn> => {
        const wrapped: ListenHandler = (e) => handler(e.payload);
        registry.calls.push({ event: "obsidiana://fs-change", handler: wrapped });
        registry.trigger = (payload) => wrapped({ payload });
        return Promise.resolve(() => {
          const idx = registry.calls.findIndex((c) => c.handler === wrapped);
          if (idx >= 0) registry.calls.splice(idx, 1);
        });
      },
    ),
  };
});

import { onFileChange } from "@/ipc/watcher";

beforeEach(() => {
  registry.calls.length = 0;
  registry.trigger = () => undefined;
  vi.mocked(onFileChange).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWatcher", () => {
  it("subscribes via onFileChange on mount and unsubscribes on unmount", async () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useWatcher(handler));
    await waitFor(() => {
      expect(onFileChange).toHaveBeenCalledTimes(1);
    });
    expect(registry.calls).toHaveLength(1);
    unmount();
    await waitFor(() => {
      expect(registry.calls).toHaveLength(0);
    });
  });

  it("forwards incoming events to the supplied handler", async () => {
    const handler = vi.fn();
    renderHook(() => useWatcher(handler));
    await waitFor(() => {
      expect(registry.calls).toHaveLength(1);
    });
    act(() => {
      registry.trigger({ kind: "changed", path: "notes/a.md" });
    });
    expect(handler).toHaveBeenCalledWith({ kind: "changed", path: "notes/a.md" });
  });

  it("does not subscribe when enabled is false and does not call the handler", async () => {
    const handler = vi.fn();
    renderHook(() => useWatcher(handler, { enabled: false }));
    // Give microtasks a chance; the hook should never have called onFileChange.
    await act(async () => {
      await Promise.resolve();
    });
    expect(onFileChange).not.toHaveBeenCalled();
    // And a manually triggered event (if we had a subscription) would not
    // reach the handler because the handler is fresh and unmocked calls
    // wouldn't fire.
    expect(handler).not.toHaveBeenCalled();
  });
});

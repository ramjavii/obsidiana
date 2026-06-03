import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invokeMock } from "@/__tests__/setup";
import {
  usePickVaultMutation,
  useOpenVaultMutation,
  useCloseVaultMutation,
  useVaultStatus,
} from "@/hooks/useVault";
import type { ReactNode } from "react";

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useVaultStatus", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve([]));
  });

  it("starts with kind=none when there is no last_vault and no recents", async () => {
    const { result } = renderHook(() => useVaultStatus(), { wrapper: wrapperFactory() });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.status).toEqual({ kind: "none" });
  });

  it("auto-opens the most recent available vault on mount", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") {
        return Promise.resolve([
          {
            name: "notes",
            path: "/tmp/notes",
            lastOpened: "2024-01-01T00:00:00Z",
            available: true,
          },
        ]);
      }
      if (cmd === "open_vault") {
        return Promise.resolve({ name: "notes", path: "/tmp/notes" });
      }
      return Promise.resolve(null);
    });
    const { result } = renderHook(() => useVaultStatus(), { wrapper: wrapperFactory() });
    await waitFor(() => {
      expect(result.current.status).toEqual({
        kind: "open",
        vault: { name: "notes", path: "/tmp/notes" },
      });
    });
  });

  it("does not auto-open a vault that is marked unavailable", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_recent_vaults") {
        return Promise.resolve([
          {
            name: "gone",
            path: "/tmp/gone",
            lastOpened: "2024-01-01T00:00:00Z",
            available: false,
          },
        ]);
      }
      return Promise.resolve(null);
    });
    const { result } = renderHook(() => useVaultStatus(), { wrapper: wrapperFactory() });
    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(result.current.status).toEqual({ kind: "none" });
  });
});

describe("usePickVaultMutation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls pick_vault and opens the result", async () => {
    let opened: { name: string; path: string } | null = null;
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "pick_vault") return Promise.resolve({ name: "p", path: "/p" });
      if (cmd === "open_vault") {
        opened = { name: "p", path: "/p" };
        return Promise.resolve(opened);
      }
      if (cmd === "list_recent_vaults") {
        return Promise.resolve(
          opened
            ? [
                {
                  name: opened.name,
                  path: opened.path,
                  lastOpened: "2024-01-01T00:00:00Z",
                  available: true,
                },
              ]
            : [],
        );
      }
      return Promise.resolve(null);
    });
    const { result } = renderHook(
      () => ({
        status: useVaultStatus(),
        pick: usePickVaultMutation(),
      }),
      { wrapper: wrapperFactory() },
    );
    await waitFor(() => {
      expect(result.current.status.isPending).toBe(false);
    });
    await act(async () => {
      await result.current.pick.mutateAsync(undefined);
    });
    await waitFor(() => {
      expect(result.current.status.status).toEqual({
        kind: "open",
        vault: { name: "p", path: "/p" },
      });
    });
  });
});

describe("useCloseVaultMutation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls close_vault and clears the status", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "close_vault") return Promise.resolve(null);
      if (cmd === "list_recent_vaults") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    const { result } = renderHook(
      () => ({
        status: useVaultStatus(),
        close: useCloseVaultMutation(),
      }),
      { wrapper: wrapperFactory() },
    );
    await waitFor(() => {
      expect(result.current.status.isPending).toBe(false);
    });
    await act(async () => {
      await result.current.close.mutateAsync(undefined);
    });
    await waitFor(() => {
      expect(result.current.status.status).toEqual({ kind: "none" });
    });
  });
});

describe("useOpenVaultMutation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls open_vault and reflects the new vault in status", async () => {
    const openedPaths: string[] = [];
    invokeMock.mockImplementation((cmd: unknown, args?: unknown) => {
      if (cmd === "open_vault") {
        const path = (args as { path?: string } | undefined)?.path ?? "";
        openedPaths.push(path);
        return Promise.resolve({ name: "x", path });
      }
      if (cmd === "list_recent_vaults") {
        const recents = openedPaths.map((p) => ({
          name: "x",
          path: p,
          lastOpened: "2024-01-01T00:00:00Z",
          available: true,
        }));
        return Promise.resolve(recents);
      }
      return Promise.resolve(null);
    });
    const { result } = renderHook(
      () => ({
        status: useVaultStatus(),
        open: useOpenVaultMutation(),
      }),
      { wrapper: wrapperFactory() },
    );
    await waitFor(() => {
      expect(result.current.status.isPending).toBe(false);
    });
    await act(async () => {
      await result.current.open.mutateAsync("/x");
    });
    await waitFor(() => {
      expect(result.current.status.status).toEqual({
        kind: "open",
        vault: { name: "x", path: "/x" },
      });
    });
  });
});

vi.mock("@/hooks/useToastStore", () => ({
  reportAppError: vi.fn(),
  reportError: vi.fn(),
  reportInfo: vi.fn(),
  reportSuccess: vi.fn(),
}));

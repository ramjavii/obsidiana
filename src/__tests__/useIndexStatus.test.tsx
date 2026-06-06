import { renderHook, waitFor, act } from "@testing-library/react";
import { vi } from "vitest";
import {
  indexStatusKey,
  useIndexStatus,
  useRebuildIndexMutation,
} from "@/hooks/useIndexStatus";
import { invokeMock } from "@/__tests__/setup";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastHost } from "@/components/ToastHost";
import { useToastStore } from "@/hooks/useToastStore";
import type { IndexStatus } from "@/types/index";

function makeStatus<V extends IndexStatus["state"]>(
  state: V,
  shape: Partial<Omit<Extract<IndexStatus, { state: V }>, "state" | "schemaVer" | "documentCount" | "lastRebuiltAt">> = {},
): Extract<IndexStatus, { state: V }> {
  return {
    state,
    schemaVer: 1,
    documentCount: 0,
    lastRebuiltAt: "2026-06-06T00:00:00Z",
    ...shape,
  } as Extract<IndexStatus, { state: V }>;
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("useIndexStatus", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("fires getIndexStatus IPC on mount", async () => {
    const status = makeStatus("ready", { documentCount: 7 });
    invokeMock.mockImplementation((cmd) => {
      if (cmd === "index_status") return Promise.resolve(status);
      return Promise.resolve(null);
    });
    const client = makeClient();
    const { result } = renderHook(() => useIndexStatus(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          {children}
          <ToastHost />
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("index_status", undefined);
    expect(result.current.data).toEqual(status);
  });

  it("derives the query key via indexStatusKey()", () => {
    expect(indexStatusKey()).toEqual(["index", "status"]);
  });

  it("surfaces AppError rejections on the query", async () => {
    invokeMock.mockImplementation((cmd) => {
      if (cmd === "index_status") {
        return Promise.reject({
          kind: "Internal",
          data: { message: "index boom" },
        });
      }
      return Promise.resolve(null);
    });
    const client = makeClient();
    const { result } = renderHook(() => useIndexStatus(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          {children}
          <ToastHost />
        </QueryClientProvider>
      ),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.kind).toBe("Internal");
  });

  it("skips the IPC when enabled is false", async () => {
    invokeMock.mockImplementation((cmd) => {
      if (cmd === "index_status") return Promise.resolve(makeStatus("ready"));
      return Promise.resolve(null);
    });
    const client = makeClient();
    const { result } = renderHook(
      () => useIndexStatus({ enabled: false }),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>
            {children}
            <ToastHost />
          </QueryClientProvider>
        ),
      },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});

describe("useRebuildIndexMutation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invokes rebuild_index and calls invalidateQueries", async () => {
    invokeMock.mockImplementation((cmd) => {
      if (cmd === "index_status") return Promise.resolve(makeStatus("ready"));
      if (cmd === "rebuild_index") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    const client = makeClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRebuildIndexMutation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          {children}
          <ToastHost />
        </QueryClientProvider>
      ),
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(invokeMock).toHaveBeenCalledWith("rebuild_index", undefined);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["index", "status"],
    });
  });

  it("surfaces AppError rejections via the toast", async () => {
    useToastStore.setState({ toasts: [] });
    invokeMock.mockImplementation((cmd) => {
      if (cmd === "rebuild_index") {
        return Promise.reject({
          kind: "Io",
          data: { path: "/x", source: "no such file" },
        });
      }
      return Promise.resolve(null);
    });
    const client = makeClient();
    const { result } = renderHook(() => useRebuildIndexMutation(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          {children}
          <ToastHost />
        </QueryClientProvider>
      ),
    });
    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch {
        // expected
      }
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts.some((t) => t.kind === "error")).toBe(true);
  });
});

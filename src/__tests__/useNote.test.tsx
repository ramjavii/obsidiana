import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invokeMock } from "@/__tests__/setup";
import { useReadNote, useWriteNoteMutation } from "@/hooks/useNote";
import type { ReactNode } from "react";

vi.mock("@/hooks/useToastStore", () => ({
  reportAppError: vi.fn(),
  reportError: vi.fn(),
  reportInfo: vi.fn(),
  reportSuccess: vi.fn(),
}));

vi.mock("@/ipc/note", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ipc/note")>();
  return {
    ...actual,
    writeNote: vi.fn(),
  };
});

import { reportAppError } from "@/hooks/useToastStore";
import { writeNote as writeNoteIpcMock } from "@/ipc/note";

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useReadNote", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("calls read_note and returns the parsed NoteContent", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "# hi",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      return Promise.resolve(null);
    });
    const { result } = renderHook(() => useReadNote("hello.md"), {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({
      path: "hello.md",
      content: "# hi",
      modifiedAt: "2026-06-03T00:00:00Z",
    });
  });

  it("does not run the query when enabled is false", async () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve(null));
    const { result } = renderHook(() => useReadNote("hello.md", { enabled: false }), {
      wrapper: wrapperFactory(),
    });
    expect(result.current.isPending).toBe(true);
    expect(invokeMock).not.toHaveBeenCalledWith("read_note", expect.anything());
  });
});

describe("useWriteNoteMutation", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.mocked(reportAppError).mockReset();
    vi.mocked(writeNoteIpcMock).mockReset();
  });

  it("calls write_note and optimistically updates the cache on success", async () => {
    vi.mocked(writeNoteIpcMock).mockResolvedValue({
      path: "hello.md",
      modifiedAt: "2026-06-03T00:00:01Z",
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(["note", "read", "hello.md"], {
      path: "hello.md",
      content: "old",
      modifiedAt: "2026-06-03T00:00:00Z",
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useWriteNoteMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ path: "hello.md", content: "new" });
    });
    const cached = client.getQueryData<{ content: string }>(["note", "read", "hello.md"]);
    expect(cached?.content).toBe("new");
  });

  it("does NOT call reportAppError when a non-AppError rejection occurs (e.g. a plain Error)", async () => {
    const plainError = new Error("network down");
    vi.mocked(writeNoteIpcMock).mockRejectedValueOnce(plainError);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(["note", "read", "hello.md"], {
      path: "hello.md",
      content: "old",
      modifiedAt: "2026-06-03T00:00:00Z",
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useWriteNoteMutation(), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ path: "hello.md", content: "new" })
        .catch(() => undefined);
    });
    expect(reportAppError).not.toHaveBeenCalled();
  });

  it("does NOT call reportAppError when a malformed object is rejected (missing 'data')", async () => {
    const malformed = { kind: "NotFound" };
    vi.mocked(writeNoteIpcMock).mockRejectedValueOnce(malformed);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(["note", "read", "hello.md"], {
      path: "hello.md",
      content: "old",
      modifiedAt: "2026-06-03T00:00:00Z",
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useWriteNoteMutation(), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ path: "hello.md", content: "new" })
        .catch(() => undefined);
    });
    expect(reportAppError).not.toHaveBeenCalled();
  });

  it("surfaces an AppError rejection via reportAppError and rolls back the optimistic update", async () => {
    const appError = { kind: "Io", data: { path: "hello.md", source: "boom" } };
    vi.mocked(writeNoteIpcMock).mockRejectedValueOnce(appError);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const original = {
      path: "hello.md",
      content: "old",
      modifiedAt: "2026-06-03T00:00:00Z",
    };
    client.setQueryData(["note", "read", "hello.md"], original);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useWriteNoteMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ path: "hello.md", content: "new" }).catch(() => undefined);
    });
    await waitFor(() => {
      expect(reportAppError).toHaveBeenCalledWith(appError);
    });
    const cached = client.getQueryData<{ content: string }>(["note", "read", "hello.md"]);
    expect(cached?.content).toBe("old");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRenderMarkdown, renderMarkdownKey } from "@/hooks/useMarkdown";
import type { RenderedNote } from "@/types/markdown";
import { invokeMock } from "./setup";
import type { ReactNode } from "react";

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useRenderMarkdown", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve("pong"));
  });

  it("sends render_markdown IPC with the path", async () => {
    const note: RenderedNote = { html: "<p>x</p>", inlineSpans: [], blockSpans: [] };
    invokeMock.mockResolvedValueOnce(note);

    const { result } = renderHook(() => useRenderMarkdown("hello.md"), {
      wrapper: wrapperFactory(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("render_markdown", { path: "hello.md" });
    expect(result.current.data).toEqual(note);
  });

  it("derives the cache key from path", () => {
    expect(renderMarkdownKey("a/b.md")).toEqual(["markdown", "render", "a/b.md"]);
  });

  it("surfaces the AppError when the IPC rejects", async () => {
    invokeMock.mockRejectedValueOnce({
      kind: "NotFound",
      data: { what: "note: missing.md" },
    });
    const { result } = renderHook(() => useRenderMarkdown("missing.md"), {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      kind: "NotFound",
      data: { what: "note: missing.md" },
    });
  });

  it("skips the IPC when enabled is false", () => {
    const { result } = renderHook(
      () => useRenderMarkdown("a.md", { enabled: false }),
      { wrapper: wrapperFactory() },
    );
    expect(result.current.isFetching).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

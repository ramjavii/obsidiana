import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useExtractWikilinks,
  useResolveWikilink,
  resolveWikilinkKey,
  wikilinksKey,
} from "@/hooks/useMarkdown";
import type { ResolvedLink, WikilinkRef } from "@/types/markdown";
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

describe("useExtractWikilinks", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve("pong"));
  });

  it("sends extract_wikilinks IPC with the path", async () => {
    const payload: WikilinkRef[] = [
      { target: "alpha", alias: null, line: 1 },
      { target: "beta", alias: "Beta Note", line: 3 },
    ];
    invokeMock.mockResolvedValueOnce(payload);

    const { result } = renderHook(() => useExtractWikilinks("note.md"), {
      wrapper: wrapperFactory(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("extract_wikilinks", {
      path: "note.md",
    });
    expect(result.current.data).toEqual(payload);
  });

  it("keys the query by path", () => {
    expect(wikilinksKey("a/b.md")).toEqual(["markdown", "wikilinks", "a/b.md"]);
  });

  it("does not call IPC when enabled is false", async () => {
    const { result } = renderHook(
      () => useExtractWikilinks("note.md", { enabled: false }),
      { wrapper: wrapperFactory() },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("surfaces the AppError when the IPC rejects", async () => {
    invokeMock.mockRejectedValueOnce({
      kind: "NotFound",
      data: { what: "note: missing.md" },
    });

    const { result } = renderHook(() => useExtractWikilinks("missing.md"), {
      wrapper: wrapperFactory(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      kind: "NotFound",
      data: { what: "note: missing.md" },
    });
  });
});

describe("useResolveWikilink", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve("pong"));
  });

  it("sends resolve_wikilink IPC with source, target, alias", async () => {
    const payload: ResolvedLink = {
      kind: "resolved",
      target: "idea",
      sourcePath: "source.md",
      resolvedPath: "idea.md",
      section: null,
      alias: null,
    };
    invokeMock.mockResolvedValueOnce(payload);

    const { result } = renderHook(
      () =>
        useResolveWikilink({
          target: "idea",
          sourcePath: "source.md",
          alias: null,
        }),
      { wrapper: wrapperFactory() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("resolve_wikilink", {
      sourcePath: "source.md",
      target: "idea",
      alias: null,
    });
    expect(result.current.data).toEqual(payload);
  });

  it("keys the query by target, sourcePath, alias", () => {
    expect(
      resolveWikilinkKey({
        target: "idea",
        sourcePath: "source.md",
        alias: "Alias",
      }),
    ).toEqual(["markdown", "resolve", "source.md", "idea", "Alias"]);
    expect(
      resolveWikilinkKey({
        target: "idea",
        sourcePath: "source.md",
        alias: null,
      }),
    ).toEqual(["markdown", "resolve", "source.md", "idea", null]);
  });

  it("surfaces the AppError when the IPC rejects", async () => {
    invokeMock.mockRejectedValueOnce({
      kind: "InvalidArgument",
      data: { message: "path escapes the vault root" },
    });

    const { result } = renderHook(
      () =>
        useResolveWikilink({
          target: "../escape",
          sourcePath: "source.md",
        }),
      { wrapper: wrapperFactory() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({
      kind: "InvalidArgument",
      data: { message: "path escapes the vault root" },
    });
  });

  it("does not call IPC when enabled is false", async () => {
    const { result } = renderHook(
      () =>
        useResolveWikilink(
          { target: "idea", sourcePath: "source.md" },
          { enabled: false },
        ),
      { wrapper: wrapperFactory() },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

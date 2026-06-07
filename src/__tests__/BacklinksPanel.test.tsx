import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BacklinksPanel } from "@/components/BacklinksPanel";
import { invokeMock } from "./setup";
import type { BacklinkRef } from "@/types/markdown";

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("BacklinksPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve("pong"));
  });

  it("sends get_backlinks IPC with the path on mount", async () => {
    const payload: BacklinkRef[] = [
      { sourcePath: "a.md", sourceTitle: "A", kind: "wikilink", blockId: null },
    ];
    invokeMock.mockResolvedValueOnce(payload);

    render(<BacklinksPanel path="note.md" />, { wrapper: wrapperFactory() });

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith("get_backlinks", {
      path: "note.md",
    });
  });

  it("shows the count of backlinks when the query succeeds", async () => {
    const payload: BacklinkRef[] = [
      { sourcePath: "a.md", sourceTitle: "A", kind: "wikilink", blockId: null },
      { sourcePath: "b.md", sourceTitle: "B", kind: "wikilink", blockId: null },
    ];
    invokeMock.mockResolvedValueOnce(payload);

    render(<BacklinksPanel path="note.md" />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("backlinks-count").textContent).toBe("2"),
    );
  });

  it("shows the empty state when the note has no backlinks", async () => {
    invokeMock.mockResolvedValueOnce([]);

    render(<BacklinksPanel path="note.md" />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("backlinks-empty")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("backlinks-count").textContent).toBe("0"),
    );
  });

  it("shows the error state when the IPC rejects with AppError", async () => {
    invokeMock.mockRejectedValueOnce({
      kind: "NotFound",
      data: { what: "note: missing.md" },
    });

    render(<BacklinksPanel path="missing.md" />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("backlinks-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("backlinks-error").textContent).toMatch(/missing/);
  });

  it("exposes the path as a data attribute", () => {
    render(<BacklinksPanel path="some/note.md" />, { wrapper: wrapperFactory() });
    expect(
      screen.getByTestId("backlinks-panel").getAttribute("data-backlinks-path"),
    ).toBe("some/note.md");
  });
});

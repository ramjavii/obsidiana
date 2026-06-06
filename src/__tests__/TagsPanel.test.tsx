import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { TagsPanel } from "@/components/TagsPanel";
import { invokeMock } from "./setup";
import type { TagRef } from "@/types/markdown";

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("TagsPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve("pong"));
  });

  it("sends get_tags_for_note IPC with the path on mount", async () => {
    const payload: TagRef[] = [
      { name: "alpha", line: 1 },
      { name: "beta", line: 3 },
    ];
    invokeMock.mockResolvedValueOnce(payload);

    render(<TagsPanel path="note.md" />, { wrapper: wrapperFactory() });

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith("get_tags_for_note", {
      path: "note.md",
    });
  });

  it("shows the count of tags when the query succeeds", async () => {
    const payload: TagRef[] = [
      { name: "alpha", line: 1 },
      { name: "beta", line: 3 },
      { name: "gamma", line: 5 },
    ];
    invokeMock.mockResolvedValueOnce(payload);

    render(<TagsPanel path="note.md" />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("tags-count").textContent).toBe("3"),
    );
  });

  it("shows the empty state when the note has no tags", async () => {
    invokeMock.mockResolvedValueOnce([]);

    render(<TagsPanel path="note.md" />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("tag-list-empty")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("tags-count").textContent).toBe("0"),
    );
  });

  it("shows the error state when the IPC rejects with AppError", async () => {
    invokeMock.mockRejectedValueOnce({
      kind: "NotFound",
      data: { what: "note: missing.md" },
    });

    render(<TagsPanel path="missing.md" />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("tags-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("tags-error").textContent).toMatch(/missing/);
  });

  it("exposes the path as a data attribute", () => {
    render(<TagsPanel path="some/note.md" />, { wrapper: wrapperFactory() });
    expect(screen.getByTestId("tags-panel").getAttribute("data-tags-path")).toBe(
      "some/note.md",
    );
  });
});

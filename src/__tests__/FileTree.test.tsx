import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { invokeMock } from "@/__tests__/setup";
import { FileTree } from "@/components/FileTree";
import type { TreeNode } from "@/types/tree";

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function mockListTree(responses: Record<string, TreeNode[]>) {
  invokeMock.mockImplementation((cmd: unknown, args?: unknown) => {
    if (cmd !== "list_tree") return Promise.resolve(null);
    const path = (args as { path?: string | null } | undefined)?.path ?? null;
    return Promise.resolve(responses[path ?? "__root__"] ?? []);
  });
}

describe("FileTree", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve(null));
  });

  it("renders loading state while root is pending", () => {
    mockListTree({});
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    expect(screen.getByTestId("tree-loading")).toBeInTheDocument();
  });

  it("renders empty state when root has no children", async () => {
    mockListTree({ __root__: [] });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("empty-tree")).toBeInTheDocument();
    });
  });

  it("renders root children when loaded", async () => {
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
        { name: "notes", path: "notes", kind: "dir", extension: null },
      ],
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
      expect(screen.getByTestId("node-notes")).toBeInTheDocument();
    });
  });

  it("calls onSelect when a file is clicked", async () => {
    const onSelect = vi.fn();
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    render(
      <FileTree selectedPath={null} onSelect={onSelect} />,
      { wrapper: wrapperFactory() },
    );
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("node-todo.md"));
    expect(onSelect).toHaveBeenCalledWith("todo.md");
  });

  it("expands a directory on click and fetches its children", async () => {
    mockListTree({
      __root__: [{ name: "notes", path: "notes", kind: "dir", extension: null }],
      notes: [
        { name: "idea.md", path: "notes/idea.md", kind: "file", extension: "md" },
      ],
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-notes")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("node-notes"));
    await waitFor(() => {
      expect(screen.getByTestId("node-notes/idea.md")).toBeInTheDocument();
    });
  });

  it("collapses a directory on second click", async () => {
    mockListTree({
      __root__: [{ name: "notes", path: "notes", kind: "dir", extension: null }],
      notes: [
        { name: "idea.md", path: "notes/idea.md", kind: "file", extension: "md" },
      ],
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-notes")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("node-notes"));
    await waitFor(() => {
      expect(screen.getByTestId("node-notes/idea.md")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("node-notes"));
    await waitFor(() => {
      expect(screen.queryByTestId("node-notes/idea.md")).not.toBeInTheDocument();
    });
  });

  it("shows a context menu on right-click", async () => {
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-todo.md"), {
      clientX: 100,
      clientY: 200,
    });
    const menu = await screen.findByTestId("context-menu");
    expect(menu).toBeInTheDocument();
    expect(screen.getByTestId("context-rename")).toBeInTheDocument();
    expect(screen.getByTestId("context-delete")).toBeInTheDocument();
    expect(screen.queryByTestId("context-new")).not.toBeInTheDocument();
  });

  it("shows New option in context menu for directories", async () => {
    mockListTree({
      __root__: [{ name: "notes", path: "notes", kind: "dir", extension: null }],
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-notes")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-notes"), {
      clientX: 50,
      clientY: 50,
    });
    await waitFor(() => {
      expect(screen.getByTestId("context-new")).toBeInTheDocument();
    });
  });

  it("closes context menu on Escape", async () => {
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-todo.md"));
    await waitFor(() => {
      expect(screen.getByTestId("context-menu")).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("context-menu")).not.toBeInTheDocument();
    });
  });

  it("creates a new note from the toolbar + New button", async () => {
    mockListTree({ __root__: [] });
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("welcome");
    invokeMock.mockImplementation((cmd: unknown, args?: unknown) => {
      if (cmd === "list_tree") return Promise.resolve([]);
      if (cmd === "create_note") {
        return Promise.resolve({
          path: (args as { path: string }).path,
          content: "",
          modifiedAt: "2024-01-01T00:00:00Z",
        });
      }
      return Promise.resolve(null);
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("empty-tree")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("new-note-root"));
    });
    await waitFor(() => {
      expect(promptSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        ([cmd]) => cmd === "create_note",
      );
      expect(calls.length).toBe(1);
      expect(calls[0]?.[1]).toEqual({ path: "welcome.md", template: "" });
    });
    promptSpy.mockRestore();
  });

  it("does not create a note when prompt is cancelled", async () => {
    mockListTree({ __root__: [] });
    vi.spyOn(window, "prompt").mockReturnValue(null);
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("empty-tree")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("new-note-root"));
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        ([cmd]) => cmd === "create_note",
      );
      expect(calls.length).toBe(0);
    });
  });

  it("creates a note inside a directory from the context menu", async () => {
    mockListTree({
      __root__: [{ name: "notes", path: "notes", kind: "dir", extension: null }],
    });
    vi.spyOn(window, "prompt").mockReturnValue("entry");
    invokeMock.mockImplementation((cmd: unknown, args?: unknown) => {
      if (cmd === "list_tree") {
        const path = (args as { path?: string | null } | undefined)?.path ?? null;
        if (path === null) {
          return Promise.resolve([
            { name: "notes", path: "notes", kind: "dir", extension: null },
          ]);
        }
        return Promise.resolve([]);
      }
      if (cmd === "create_note") {
        return Promise.resolve({
          path: (args as { path: string }).path,
          content: "",
          modifiedAt: "2024-01-01T00:00:00Z",
        });
      }
      return Promise.resolve(null);
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-notes")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-notes"));
    await waitFor(() => {
      expect(screen.getByTestId("context-new")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("context-new"));
    });
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        ([cmd]) => cmd === "create_note",
      );
      expect(calls.length).toBe(1);
      expect(calls[0]?.[1]).toEqual({
        path: "notes/entry.md",
        template: "",
      });
    });
  });

  it("renames a file from the context menu", async () => {
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    vi.spyOn(window, "prompt").mockReturnValue("renamed");
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_tree") {
        return Promise.resolve([
          { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
        ]);
      }
      if (cmd === "rename_note") {
        return Promise.resolve({ from: "todo.md", to: "renamed.md" });
      }
      return Promise.resolve(null);
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-todo.md"));
    await waitFor(() => {
      expect(screen.getByTestId("context-rename")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("context-rename"));
    });
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        ([cmd]) => cmd === "rename_note",
      );
      expect(calls.length).toBe(1);
      expect(calls[0]?.[1]).toEqual({ from: "todo.md", to: "renamed.md" });
    });
  });

  it("deletes a file after confirm", async () => {
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_tree") {
        return Promise.resolve([
          { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
        ]);
      }
      if (cmd === "delete_note") return Promise.resolve(undefined);
      return Promise.resolve(null);
    });
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-todo.md"));
    await waitFor(() => {
      expect(screen.getByTestId("context-delete")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("context-delete"));
    });
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        ([cmd]) => cmd === "delete_note",
      );
      expect(calls.length).toBe(1);
      expect(calls[0]?.[1]).toEqual({ path: "todo.md" });
    });
  });

  it("does not delete when confirm is cancelled", async () => {
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<FileTree selectedPath={null} onSelect={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-todo.md"));
    await waitFor(() => {
      expect(screen.getByTestId("context-delete")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("context-delete"));
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(
        ([cmd]) => cmd === "delete_note",
      );
      expect(calls.length).toBe(0);
    });
  });

  it("clears the selection when the selected file is deleted", async () => {
    const onSelect = vi.fn();
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "list_tree") {
        return Promise.resolve([
          { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
        ]);
      }
      if (cmd === "delete_note") return Promise.resolve(undefined);
      return Promise.resolve(null);
    });
    render(
      <FileTree
        selectedPath="todo.md"
        onSelect={onSelect}
      />,
      { wrapper: wrapperFactory() },
    );
    await waitFor(() => {
      expect(screen.getByTestId("node-todo.md")).toBeInTheDocument();
    });
    fireEvent.contextMenu(screen.getByTestId("node-todo.md"));
    await waitFor(() => {
      expect(screen.getByTestId("context-delete")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("context-delete"));
    });
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith("");
    });
  });

  it("marks the selected file with data-selected=true", async () => {
    mockListTree({
      __root__: [
        { name: "todo.md", path: "todo.md", kind: "file", extension: "md" },
      ],
    });
    render(
      <FileTree
        selectedPath="todo.md"
        onSelect={() => undefined}
      />,
      { wrapper: wrapperFactory() },
    );
    await waitFor(() => {
      const node = screen.getByTestId("node-todo.md");
      expect(node.getAttribute("data-selected")).toBe("true");
    });
  });
});

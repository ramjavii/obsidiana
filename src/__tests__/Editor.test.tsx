import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  invokeMock,
  cmUpdateListeners,
  cmLastExtensions,
  cmReconfigures,
  setCmSharedDoc,
  fireCmUpdate,
  resetCmTracking,
} from "@/__tests__/setup";
import { Editor } from "@/components/Editor";
import { ToastHost } from "@/components/ToastHost";

vi.mock("@/hooks/useToastStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useToastStore")>();
  return actual;
});

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      {children}
      <ToastHost />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(() => Promise.resolve(null));
  resetCmTracking();
  setCmSharedDoc("# hi");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Editor", () => {
  it("renders the file path in the header and a close button", async () => {
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
    render(<Editor path="hello.md" onClose={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    const editor = await screen.findByTestId("editor");
    expect(editor.getAttribute("data-editor-path")).toBe("hello.md");
    expect(screen.getByTestId("editor-close")).toBeInTheDocument();
  });

  it("shows Saving status while a write is in flight and resolves to Saved", async () => {
    let releaseWrite: (() => void) | null = null;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "# hi",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      if (cmd === "write_note") {
        return writeGate.then(() => ({
          path: "hello.md",
          modifiedAt: "2026-06-03T00:00:01Z",
        }));
      }
      return Promise.resolve(null);
    });
    render(<Editor path="hello.md" onClose={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await screen.findByTestId("editor");
    await waitFor(() => {
      expect(screen.getByTestId("editor-status")).toHaveTextContent("Saved");
    });
    setCmSharedDoc("edited body");
    act(() => {
      fireCmUpdate(true, "edited body");
    });
    await waitFor(() => {
      expect(screen.getByTestId("editor-status")).toHaveTextContent("Saving");
    });
    act(() => {
      releaseWrite?.();
    });
    await waitFor(() => {
      expect(screen.getByTestId("editor-status")).toHaveTextContent("Saved");
    });
    const writeCall = invokeMock.mock.calls.find(([cmd]) => cmd === "write_note");
    expect(writeCall?.[1]).toEqual({ path: "hello.md", content: "edited body" });
  });

  it("shows the error chip and pushes a toast when the save fails", async () => {
    const appError = { kind: "Io", data: { path: "hello.md", source: "boom" } };
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "# hi",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      if (cmd === "write_note") {
        return Promise.reject(appError);
      }
      return Promise.resolve(null);
    });
    render(<Editor path="hello.md" onClose={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await screen.findByTestId("editor");
    await waitFor(() => {
      expect(screen.getByTestId("editor-status")).toHaveTextContent("Saved");
    });
    setCmSharedDoc("edited");
    act(() => {
      fireCmUpdate(true, "edited");
    });
    await waitFor(
      () => {
        expect(screen.getByTestId("editor-status")).toHaveTextContent("Error");
      },
      { timeout: 3000 },
    );
    expect(screen.getAllByTestId("toast-error").length).toBeGreaterThan(0);
  });

  it("calls onClose when the close button is clicked (after a best-effort flush)", async () => {
    let closeCount = 0;
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
    render(<Editor path="hello.md" onClose={() => { closeCount += 1; }} />, {
      wrapper: wrapperFactory(),
    });
    await screen.findByTestId("editor");
    fireEvent.click(screen.getByTestId("editor-close"));
    await waitFor(() => {
      expect(closeCount).toBe(1);
    });
  });

  it("destroys the old view and creates a new one when the path changes", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "ignored.md",
          content: "# hi",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      return Promise.resolve(null);
    });
    const { rerender } = render(<Editor path="a.md" onClose={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await screen.findByTestId("editor");
    await waitFor(() => {
      expect(cmUpdateListeners.length).toBeGreaterThanOrEqual(1);
    });
    const listenersBefore = cmUpdateListeners.length;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Editor path="b.md" onClose={() => undefined} />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(cmUpdateListeners.length).toBeGreaterThan(listenersBefore);
    });
  });

  it("preserves the view when read.data ref changes without a path change (regression for focus loss)", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    let readCount = 0;
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        readCount += 1;
        return Promise.resolve({
          path: "hello.md",
          content: "# hi",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      return Promise.resolve(null);
    });
    render(<Editor path="hello.md" onClose={() => undefined} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>
          {children}
          <ToastHost />
        </QueryClientProvider>
      ),
    });
    await screen.findByTestId("editor");
    await waitFor(() => {
      expect(cmUpdateListeners.length).toBeGreaterThanOrEqual(1);
    });
    const listenersBefore = cmUpdateListeners.length;

    await act(async () => {
      await client.invalidateQueries({ queryKey: ["note", "read", "hello.md"] });
    });
    await waitFor(() => {
      expect(readCount).toBeGreaterThan(1);
    });

    expect(cmUpdateListeners.length).toBe(listenersBefore);
  });

  it("mounts the editor with wikilink content without errors (2.3)", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "See [[note]] and [[other|alias]] but ![[embed]] is not styled",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      return Promise.resolve(null);
    });
    render(<Editor path="hello.md" onClose={() => undefined} />, {
      wrapper: wrapperFactory(),
    });
    await screen.findByTestId("editor");
    await waitFor(() => {
      expect(screen.getByTestId("editor-status")).toHaveTextContent("Saved");
    });
    const compartmentWrappers = cmLastExtensions.filter(
      (ext) =>
        ext &&
        typeof ext === "object" &&
        (ext as { __isCompartmentOf?: boolean }).__isCompartmentOf === true,
    );
    expect(compartmentWrappers.length).toBeGreaterThan(0);
  });
});

describe("Editor — wikilink click-to-jump (2.4)", () => {
  function findClickHandler(): {
    mousedown: (event: unknown, view: unknown) => boolean;
  } {
    const wrapper = cmLastExtensions.find(
      (ext) =>
        ext &&
        typeof ext === "object" &&
        (ext as { __isDomEventHandlers?: boolean }).__isDomEventHandlers === true,
    ) as { handlers: Record<string, (event: unknown, view: unknown) => boolean> } | undefined;
    if (!wrapper) throw new Error("WIKILINK_CLICK_HANDLER not found in extensions");
    if (typeof wrapper.handlers.mousedown !== "function") {
      throw new Error("mousedown handler not found in click handler extension");
    }
    return { mousedown: wrapper.handlers.mousedown };
  }

  function makeFakeClickEvent(target: HTMLElement): {
    target: HTMLElement;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    preventDefault: () => void;
  } {
    return {
      target,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      preventDefault: () => undefined,
    };
  }

  it("calls onJump with the resolved path when a resolved wikilink is clicked", async () => {
    invokeMock.mockImplementation((cmd: unknown, args?: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "See [[note]] here",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      if (cmd === "extract_wikilinks") {
        return Promise.resolve([{ target: "note", alias: null, line: 1 }]);
      }
      if (cmd === "resolve_wikilink") {
        return Promise.resolve({
          kind: "resolved",
          target: (args as { target: string }).target,
          sourcePath: "hello.md",
          resolvedPath: "note.md",
          section: null,
          alias: null,
        });
      }
      return Promise.resolve(null);
    });
    const onJump = vi.fn();
    render(
      <Editor
        path="hello.md"
        onClose={() => undefined}
        onJump={onJump}
        onBrokenClick={() => undefined}
      />,
      { wrapper: wrapperFactory() },
    );
    await screen.findByTestId("editor");
    await waitFor(
      () => {
        const calls = invokeMock.mock.calls.filter(([c]) => c === "resolve_wikilink");
        expect(calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
    const { mousedown } = findClickHandler();
    const el = document.createElement("span");
    el.setAttribute("data-wikilink-target", "note");
    el.className = "cm-wikilink cm-wikilink-resolved";
    document.body.appendChild(el);
    try {
      mousedown(makeFakeClickEvent(el), null);
      expect(onJump).toHaveBeenCalledWith("note.md", null);
    } finally {
      el.remove();
    }
  });

  it("calls onBrokenClick when a broken wikilink is clicked", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "See [[ghost]] here",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      if (cmd === "extract_wikilinks") {
        return Promise.resolve([{ target: "ghost", alias: null, line: 1 }]);
      }
      if (cmd === "resolve_wikilink") {
        return Promise.resolve({
          kind: "broken",
          target: "ghost",
          sourcePath: "hello.md",
          section: null,
          alias: null,
        });
      }
      return Promise.resolve(null);
    });
    const onBrokenClick = vi.fn();
    render(
      <Editor
        path="hello.md"
        onClose={() => undefined}
        onJump={() => undefined}
        onBrokenClick={onBrokenClick}
      />,
      { wrapper: wrapperFactory() },
    );
    await screen.findByTestId("editor");
    await waitFor(
      () => {
        const calls = invokeMock.mock.calls.filter(([c]) => c === "resolve_wikilink");
        expect(calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
    const { mousedown } = findClickHandler();
    const el = document.createElement("span");
    el.setAttribute("data-wikilink-target", "ghost");
    el.className = "cm-wikilink cm-wikilink-broken";
    document.body.appendChild(el);
    try {
      mousedown(makeFakeClickEvent(el), null);
      expect(onBrokenClick).toHaveBeenCalledWith("ghost", "hello.md", null);
    } finally {
      el.remove();
    }
  });

  it("reconfigures the wikilink compartment when the resolution map updates", async () => {
    invokeMock.mockImplementation((cmd: unknown) => {
      if (cmd === "read_note") {
        return Promise.resolve({
          path: "hello.md",
          content: "See [[ghost]] here",
          modifiedAt: "2026-06-03T00:00:00Z",
        });
      }
      if (cmd === "extract_wikilinks") {
        return Promise.resolve([{ target: "ghost", alias: null, line: 1 }]);
      }
      if (cmd === "resolve_wikilink") {
        return Promise.resolve({
          kind: "broken",
          target: "ghost",
          sourcePath: "hello.md",
          section: null,
          alias: null,
        });
      }
      return Promise.resolve(null);
    });
    render(
      <Editor
        path="hello.md"
        onClose={() => undefined}
        onJump={() => undefined}
        onBrokenClick={() => undefined}
      />,
      { wrapper: wrapperFactory() },
    );
    await screen.findByTestId("editor");
    await waitFor(
      () => {
        const calls = invokeMock.mock.calls.filter(([c]) => c === "resolve_wikilink");
        expect(calls.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
    await waitFor(() => {
      const reconfigureWithExt = cmReconfigures.filter((r) => r.ext !== undefined);
      expect(reconfigureWithExt.length).toBeGreaterThan(0);
    });
  });
});

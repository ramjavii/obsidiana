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
  setCmSharedDoc,
  fireCmUpdate,
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
  cmUpdateListeners.length = 0;
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
});

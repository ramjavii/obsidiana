import "@testing-library/jest-dom/vitest";
import { vi, afterEach, type Mock } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastHost } from "@/components/ToastHost";

export const invokeMock: Mock<(cmd: unknown, args?: unknown) => Promise<unknown>> =
  vi.fn(() => Promise.resolve("pong"));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: unknown, args?: unknown) =>
    invokeMock(cmd, args) as Promise<unknown>,
}));

export const cmUpdateListeners: Array<(u: unknown) => void> = [];
export let cmSharedDoc = "";

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: (cfg: { doc?: string }) => ({
      doc: { toString: () => cmSharedDoc || cfg.doc || "" },
    }),
  },
  Compartment: class {
    reconfigure() {
      return {};
    }
  },
}));
vi.mock("@codemirror/view", () => ({
  EditorView: class {
    state: { doc: { toString: () => string } };
    dom: HTMLElement;
    constructor(cfg: { state: { doc: { toString: () => string } }; parent: HTMLElement }) {
      this.state = cfg.state;
      this.dom = cfg.parent;
    }
    destroy() {
      this.dom.innerHTML = "";
    }
    dispatch() {
      cmSharedDoc = this.state.doc.toString();
    }
    static updateListener = {
      of: (fn: (u: unknown) => void) => {
        cmUpdateListeners.push(fn);
        return {};
      },
    };
  },
  keymap: { of: () => ({}) },
  lineNumbers: () => ({}),
  highlightActiveLine: () => ({}),
  lineWrapping: {},
}));
vi.mock("@codemirror/commands", () => ({
  defaultKeymap: [],
  history: () => ({}),
  historyKeymap: [],
  indentWithTab: {},
}));
vi.mock("@codemirror/lang-markdown", () => ({
  markdown: () => ({}),
}));
vi.mock("@codemirror/theme-one-dark", () => ({
  oneDark: {},
}));

// useToastStore is intentionally NOT mocked globally. Tests that need to
// stub it (Editor.test.tsx) do so with a local vi.mock. Tests that exercise
// the real toast UI (ToastHost.test.tsx) get the real Zustand store.

export function setCmSharedDoc(value: string) {
  cmSharedDoc = value;
}

export function clearCmUpdateListeners() {
  cmUpdateListeners.length = 0;
}

export function fireCmUpdate(docChanged: boolean, doc: string) {
  for (const fn of cmUpdateListeners) {
    fn({ docChanged, state: { doc: { toString: () => doc } } });
  }
}

export function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {ui}
      <ToastHost />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  cmUpdateListeners.length = 0;
  cmSharedDoc = "";
  invokeMock.mockReset();
  invokeMock.mockImplementation(() => Promise.resolve("pong"));
});

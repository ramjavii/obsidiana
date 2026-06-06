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
export const cmLastExtensions: unknown[] = [];
export const cmReconfigures: Array<{ compartment: unknown; ext: unknown }> = [];
export type CmDecorationSpec = {
  class?: string;
  attributes?: Record<string, string>;
};
export const cmLastDecorations: Array<{
  from: number;
  to: number;
  spec: CmDecorationSpec;
}> = [];

export function resetCmTracking() {
  cmUpdateListeners.length = 0;
  cmLastExtensions.length = 0;
  cmReconfigures.length = 0;
  cmLastDecorations.length = 0;
  cmSharedDoc = "";
}

vi.mock("@codemirror/state", () => ({
  EditorState: {
    create: (cfg: { doc?: string; extensions?: unknown[] }) => {
      cmLastExtensions.length = 0;
      if (cfg.extensions) {
        for (const ext of cfg.extensions) cmLastExtensions.push(ext);
      }
      return {
        doc: { toString: () => cmSharedDoc || cfg.doc || "" },
      };
    },
  },
  Compartment: class {
    constructor() {
      cmReconfigures.push({ compartment: this, ext: undefined });
    }
    of(ext: unknown) {
      return { __isCompartmentOf: true, compartment: this, ext };
    }
    reconfigure(ext: unknown) {
      cmReconfigures.push({ compartment: this, ext });
      return { __isReconfigure: true, compartment: this, ext };
    }
    get(_state: unknown) {
      return undefined;
    }
  },
  RangeSetBuilder: class {
    private items: unknown[] = [];
    add(_from: number, _to: number, deco: unknown) {
      this.items.push(deco);
    }
    finish() {
      return { __isRangeSet: true, items: this.items };
    }
  },
}));
vi.mock("@codemirror/view", () => {
  class EditorView {
    state: { doc: { toString: () => string } };
    dom: HTMLElement;
    constructor(cfg: { state: { doc: { toString: () => string } }; parent: HTMLElement }) {
      this.state = cfg.state;
      this.dom = cfg.parent;
    }
    destroy() {
      this.dom.innerHTML = "";
    }
    dispatch(spec?: { effects?: unknown[] }) {
      cmSharedDoc = this.state.doc.toString();
      if (spec && Array.isArray(spec.effects)) {
        for (const eff of spec.effects) {
          const e = eff as { __isReconfigure?: boolean; ext?: unknown; compartment?: unknown };
          if (e && e.__isReconfigure) {
            cmReconfigures.push({ compartment: e.compartment, ext: e.ext });
          }
        }
      }
    }
    static updateListener = {
      of: (fn: (u: unknown) => void) => {
        cmUpdateListeners.push(fn);
        return { __isUpdateListener: true, fn };
      },
    };
    static decorations: unknown = { __isDecorationFacet: true };
    static domEventHandlers(handlers: Record<string, unknown>) {
      return { __isDomEventHandlers: true, handlers };
    }
  }

  class Decoration {
    spec: { class?: string; attributes?: Record<string, string> };
    from: number;
    to: number;
    constructor(spec: { class?: string; attributes?: Record<string, string> }, from = 0, to = 0) {
      this.spec = spec;
      this.from = from;
      this.to = to;
      cmLastDecorations.push({ from, to, spec: { ...spec } });
    }
    static mark(spec: { class?: string; attributes?: Record<string, string> }) {
      return new Decoration(spec);
    }
    static line(spec: { class?: string; attributes?: Record<string, string> }) {
      return new Decoration(spec);
    }
    static none = { __isNone: true };
  }

  class MatchDecorator {
    regexp: RegExp;
    decoration: (match: RegExpExecArray) => unknown;
    constructor(cfg: { regexp: RegExp; decoration: (match: RegExpExecArray) => unknown }) {
      this.regexp = cfg.regexp;
      this.decoration = cfg.decoration;
    }
    scanDoc(view: { state: { doc: { toString: () => string } } }) {
      const text = view.state.doc.toString();
      const re = new RegExp(this.regexp.source, this.regexp.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        this.decoration(m);
        if (m[0].length === 0) re.lastIndex += 1;
      }
    }
    createDeco(view: { state: { doc: { toString: () => string } } }) {
      this.scanDoc(view);
      return { __isDecoSet: true, size: 0, iter: () => null };
    }
    updateDeco(update: unknown, decorations: unknown) {
      const u = update as { view?: { state: { doc: { toString: () => string } } } };
      if (u && u.view) this.scanDoc(u.view);
      return decorations;
    }
  }

  class ViewPlugin {
    static fromClass() {
      return { __isViewPlugin: true };
    }
  }

  return {
    EditorView,
    Decoration,
    MatchDecorator,
    ViewPlugin,
    keymap: { of: () => ({}) },
    lineNumbers: () => ({}),
    highlightActiveLine: () => ({}),
    lineWrapping: {},
  };
});
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
  resetCmTracking();
  invokeMock.mockReset();
  invokeMock.mockImplementation(() => Promise.resolve("pong"));
});

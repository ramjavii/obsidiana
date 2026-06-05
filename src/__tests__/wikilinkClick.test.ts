import { describe, it, expect, vi } from "vitest";
import {
  WIKILINK_PATTERN,
  buildWikilinkClickHandler,
} from "@/extensions/wikilinkHighlight";
import type { ResolvedLink } from "@/types/markdown";

type Actions = Parameters<typeof buildWikilinkClickHandler>[0];

function makeElement(opts: {
  target?: string;
  alias?: string | null;
  insideDecoration?: boolean;
}): HTMLElement {
  const el = document.createElement(opts.insideDecoration ? "span" : "div");
  if (opts.insideDecoration) {
    el.className = "cm-wikilink cm-wikilink-resolved";
  }
  if (opts.target !== undefined) {
    el.setAttribute("data-wikilink-target", opts.target);
  }
  if (opts.alias !== undefined && opts.alias !== null) {
    el.setAttribute("data-wikilink-alias", opts.alias);
  }
  return el;
}

function makeEvent(target: HTMLElement, modifier: "none" | "alt" | "ctrl" | "meta" = "none"): MouseEvent {
  return {
    target,
    altKey: modifier === "alt",
    ctrlKey: modifier === "ctrl",
    metaKey: modifier === "meta",
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent;
}

describe("WIKILINK_PATTERN", () => {
  it("matches a bare [[note]]", () => {
    const re = new RegExp(WIKILINK_PATTERN.source, WIKILINK_PATTERN.flags);
    const m = re.exec("See [[note]] here");
    expect(m?.[1]).toBe("note");
  });

  it("matches [[note|alias]]", () => {
    const re = new RegExp(WIKILINK_PATTERN.source, WIKILINK_PATTERN.flags);
    const m = re.exec("See [[note|Alias]] here");
    expect(m?.[1]).toBe("note");
    expect(m?.[2]).toBe("Alias");
  });

  it("excludes ![[embed]] via lookbehind", () => {
    const re = new RegExp(WIKILINK_PATTERN.source, WIKILINK_PATTERN.flags);
    const m = re.exec("![[embed]] only");
    expect(m).toBeNull();
  });
});

describe("buildWikilinkClickHandler", () => {
  function setup() {
    const onJump = vi.fn();
    const onBrokenClick = vi.fn();
    const getState = vi.fn();
    const getSourcePath = vi.fn(() => "source.md");
    const actions: Actions = { onJump, onBrokenClick, getState, getSourcePath };
    const handlers = buildWikilinkClickHandler(actions);
    expect(typeof handlers).toBe("function");
    return { handlers, onJump, onBrokenClick, getState, getSourcePath, actions };
  }

  it("calls onJump when a resolved decoration is clicked", () => {
    const { handlers, onJump, onBrokenClick, getState } = setup();
    const el = makeElement({ target: "idea", alias: null, insideDecoration: true });
    const resolved: ResolvedLink = {
      kind: "resolved",
      target: "idea",
      sourcePath: "source.md",
      resolvedPath: "idea.md",
      section: null,
      alias: null,
    };
    getState.mockReturnValue(resolved);

    const result = handlers(makeEvent(el), "mousedown");

    expect(result).toBe(true);
    expect(getState).toHaveBeenCalledWith("idea", null);
    expect(onJump).toHaveBeenCalledWith("idea.md", null);
    expect(onBrokenClick).not.toHaveBeenCalled();
  });

  it("calls onBrokenClick when a broken decoration is clicked", () => {
    const { handlers, onJump, onBrokenClick, getState, getSourcePath } = setup();
    const el = makeElement({ target: "ghost", alias: null, insideDecoration: true });
    const broken: ResolvedLink = {
      kind: "broken",
      target: "ghost",
      sourcePath: "source.md",
      section: null,
      alias: null,
    };
    getState.mockReturnValue(broken);

    const result = handlers(makeEvent(el), "mousedown");

    expect(result).toBe(true);
    expect(getState).toHaveBeenCalledWith("ghost", null);
    expect(getSourcePath).toHaveBeenCalled();
    expect(onBrokenClick).toHaveBeenCalledWith("ghost", "source.md", null);
    expect(onJump).not.toHaveBeenCalled();
  });

  it("passes the alias through to the lookup", () => {
    const { handlers, onJump, getState } = setup();
    const el = makeElement({ target: "idea", alias: "Display", insideDecoration: true });
    const resolved: ResolvedLink = {
      kind: "resolved",
      target: "idea",
      sourcePath: "source.md",
      resolvedPath: "notes/idea.md",
      section: "Section A",
      alias: "Display",
    };
    getState.mockReturnValue(resolved);

    handlers(makeEvent(el), "click");

    expect(getState).toHaveBeenCalledWith("idea", "Display");
    expect(onJump).toHaveBeenCalledWith("notes/idea.md", "Section A");
  });

  it("ignores clicks that are not inside a .cm-wikilink span", () => {
    const { handlers, onJump, onBrokenClick, getState } = setup();
    const el = makeElement({ target: "idea", alias: null, insideDecoration: false });
    const result = handlers(makeEvent(el), "mousedown");
    expect(result).toBe(false);
    expect(getState).not.toHaveBeenCalled();
    expect(onJump).not.toHaveBeenCalled();
    expect(onBrokenClick).not.toHaveBeenCalled();
  });

  it("ignores modifier-keyed clicks (alt/ctrl/meta) so text selection still works", () => {
    const { handlers, onJump, onBrokenClick, getState } = setup();
    const el = makeElement({ target: "idea", alias: null, insideDecoration: true });
    for (const mod of ["alt", "ctrl", "meta"] as const) {
      const result = handlers(makeEvent(el, mod), "mousedown");
      expect(result).toBe(false);
    }
    expect(getState).not.toHaveBeenCalled();
    expect(onJump).not.toHaveBeenCalled();
    expect(onBrokenClick).not.toHaveBeenCalled();
  });

  it("passes null for the alias lookup when the alias attribute is missing", () => {
    const { handlers, getState, onJump } = setup();
    const el = makeElement({ target: "idea", insideDecoration: true });
    el.className = "cm-wikilink cm-wikilink-resolved";
    el.setAttribute("data-wikilink-target", "idea");
    const resolved: ResolvedLink = {
      kind: "resolved",
      target: "idea",
      sourcePath: "source.md",
      resolvedPath: "idea.md",
      section: null,
      alias: null,
    };
    getState.mockReturnValue(resolved);
    handlers(makeEvent(el), "mousedown");
    expect(getState).toHaveBeenCalledWith("idea", null);
    expect(onJump).toHaveBeenCalledWith("idea.md", null);
  });
});

import { describe, it, expect, vi } from "vitest";
import type { RenderedNote, RenderedKind } from "@/types/markdown";
import {
  buildInlineDecorations,
  spanToMark,
  blockSpanToLineAttributes,
  cssClassForKind,
} from "@/extensions/inlineRender";

function strong(): RenderedKind {
  return { kind: "strong" };
}

function em(): RenderedKind {
  return { kind: "emphasis" };
}

function heading(level: number): RenderedKind {
  return { kind: "heading", level };
}

function inlineCode(): RenderedKind {
  return { kind: "codeInline" };
}

function codeBlock(): RenderedKind {
  return { kind: "codeBlock" };
}

function link(): RenderedKind {
  return { kind: "link" };
}

function wikilinkResolved(): RenderedKind {
  return { kind: "wikilinkResolved" };
}

describe("cssClassForKind", () => {
  it("maps Strong to cm-md-strong", () => {
    expect(cssClassForKind(strong())).toBe("cm-md-strong");
  });
  it("maps Emphasis to cm-md-em", () => {
    expect(cssClassForKind(em())).toBe("cm-md-em");
  });
  it("maps Heading(1) to cm-md-heading cm-md-heading-1", () => {
    expect(cssClassForKind(heading(1))).toBe("cm-md-heading cm-md-heading-1");
  });
  it("maps Heading(3) to cm-md-heading cm-md-heading-3", () => {
    expect(cssClassForKind(heading(3))).toBe("cm-md-heading cm-md-heading-3");
  });
  it("maps CodeInline to cm-md-code-inline", () => {
    expect(cssClassForKind(inlineCode())).toBe("cm-md-code-inline");
  });
  it("maps Link to cm-md-link", () => {
    expect(cssClassForKind(link())).toBe("cm-md-link");
  });
  it("maps WikilinkResolved to cm-md-wikilink-resolved", () => {
    expect(cssClassForKind(wikilinkResolved())).toBe("cm-md-wikilink-resolved");
  });
});

describe("spanToMark", () => {
  it("returns a Mark decoration spec with the right class and range", () => {
    const spec = spanToMark(0, 5, strong());
    expect(spec).toEqual({
      kind: "mark",
      from: 0,
      to: 5,
      className: "cm-md-strong",
    });
  });

  it("uses composite class for heading inline marks (e.g. heading 2)", () => {
    const spec = spanToMark(0, 4, heading(2));
    expect(spec.className).toBe("cm-md-heading cm-md-heading-2");
  });

  it("handles wikilink resolved class", () => {
    const spec = spanToMark(10, 18, wikilinkResolved());
    expect(spec.className).toBe("cm-md-wikilink-resolved");
  });
});

describe("blockSpanToLineAttributes", () => {
  it("returns a line attribute spec for a heading block", () => {
    const spec = blockSpanToLineAttributes(1, 1, heading(1));
    expect(spec).toEqual({
      kind: "lineAttributes",
      startLine: 1,
      endLine: 1,
      className: "cm-md-heading cm-md-heading-1",
    });
  });

  it("returns a line attribute spec for a multi-line code block", () => {
    const spec = blockSpanToLineAttributes(3, 5, codeBlock());
    expect(spec).toEqual({
      kind: "lineAttributes",
      startLine: 3,
      endLine: 5,
      className: "cm-md-block-code-block",
    });
  });
});

describe("buildInlineDecorations", () => {
  it("returns an empty array for null rendered note", () => {
    expect(buildInlineDecorations(null)).toEqual([]);
  });

  it("returns an empty array for empty note", () => {
    const note: RenderedNote = { html: "", inlineSpans: [], blockSpans: [] };
    expect(buildInlineDecorations(note)).toEqual([]);
  });

  it("converts each inline span to a mark spec", () => {
    const note: RenderedNote = {
      html: "<p><strong>x</strong></p>",
      inlineSpans: [
        { start: 0, end: 2, kind: strong() },
        { start: 3, end: 4, kind: em() },
      ],
      blockSpans: [],
    };
    const specs = buildInlineDecorations(note);
    expect(specs).toEqual([
      { kind: "mark", from: 0, to: 2, className: "cm-md-strong" },
      { kind: "mark", from: 3, to: 4, className: "cm-md-em" },
    ]);
  });

  it("converts block spans to line attribute specs", () => {
    const note: RenderedNote = {
      html: "<h1>x</h1>",
      inlineSpans: [],
      blockSpans: [{ startLine: 1, endLine: 1, kind: heading(1) }],
    };
    const specs = buildInlineDecorations(note);
    expect(specs).toEqual([
      {
        kind: "lineAttributes",
        startLine: 1,
        endLine: 1,
        className: "cm-md-heading cm-md-heading-1",
      },
    ]);
  });

  it("returns both inline and block specs in the same call", () => {
    const note: RenderedNote = {
      html: "<h1>title</h1>",
      inlineSpans: [{ start: 4, end: 9, kind: strong() }],
      blockSpans: [{ startLine: 1, endLine: 1, kind: heading(1) }],
    };
    const specs = buildInlineDecorations(note);
    expect(specs).toHaveLength(2);
    expect(specs.some((s) => s.kind === "mark")).toBe(true);
    expect(specs.some((s) => s.kind === "lineAttributes")).toBe(true);
  });
});

describe("inlineRender extension factory", () => {
  it("returns a CodeMirror extension object", async () => {
    const { inlineRender } = await import("@/extensions/inlineRender");
    const getRendered = (): RenderedNote | null => null;
    const ext = inlineRender(getRendered);
    expect(ext).toBeDefined();
    expect(ext).toHaveProperty("__isViewPlugin");
  });

  it("the underlying factory reads the current rendered note at construction time", async () => {
    const { inlineRender } = await import("@/extensions/inlineRender");
    const getRendered = vi.fn(
      (): RenderedNote | null => ({
        html: "<p>x</p>",
        inlineSpans: [{ start: 0, end: 1, kind: strong() }],
        blockSpans: [],
      }),
    );
    const ext = inlineRender(getRendered);
    expect(ext).toBeDefined();
    expect(typeof getRendered).toBe("function");
  });
});

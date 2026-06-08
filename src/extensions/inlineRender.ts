import { EditorView, ViewPlugin, Decoration, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import type { RenderedKind, RenderedNote } from "@/types/markdown";

export type InlineMarkSpec = {
  kind: "mark";
  from: number;
  to: number;
  className: string;
};

export type InlineLineAttrSpec = {
  kind: "lineAttributes";
  startLine: number;
  endLine: number;
  className: string;
};

export type InlineDecorationSpec = InlineMarkSpec | InlineLineAttrSpec;

export type WikilinkRange = {
  from: number;
  to: number;
};

const BRACKET_CLASS = "cm-md-wikilink-bracket";
const CURSOR_INSIDE_CLASS = "cm-wikilink-cursor-inside";

export function cssClassForKind(kind: RenderedKind): string {
  switch (kind.kind) {
    case "strong":
      return "cm-md-strong";
    case "emphasis":
      return "cm-md-em";
    case "strikethrough":
      return "cm-md-strikethrough";
    case "heading":
      return `cm-md-heading cm-md-heading-${kind.level}`;
    case "codeInline":
      return "cm-md-code-inline";
    case "codeBlock":
      return "cm-md-block-code-block";
    case "link":
      return "cm-md-link";
    case "wikilinkResolved":
      return "cm-md-wikilink-resolved";
  }
}

export function spanToMark(start: number, end: number, kind: RenderedKind): InlineMarkSpec {
  return { kind: "mark", from: start, to: end, className: cssClassForKind(kind) };
}

export function blockSpanToLineAttributes(
  startLine: number,
  endLine: number,
  kind: RenderedKind,
): InlineLineAttrSpec {
  return {
    kind: "lineAttributes",
    startLine,
    endLine,
    className: cssClassForKind(kind),
  };
}

export function buildInlineDecorations(
  note: RenderedNote | null,
  docText?: string,
): { specs: InlineDecorationSpec[]; wikilinkRanges: WikilinkRange[] } {
  if (note === null) return { specs: [], wikilinkRanges: [] };
  const specs: InlineDecorationSpec[] = [];
  const wikilinkRanges: WikilinkRange[] = [];
  for (const span of note.inlineSpans) {
    if (span.kind.kind === "wikilinkResolved" && docText) {
      const from = span.start;
      const to = span.end;
      if (
        to - from >= 4 &&
        docText.slice(from, from + 2) === "[[" &&
        docText.slice(to - 2, to) === "]]"
      ) {
        wikilinkRanges.push({ from, to });
        specs.push({
          kind: "mark",
          from,
          to: from + 2,
          className: BRACKET_CLASS,
        });
        specs.push({
          kind: "mark",
          from: from + 2,
          to: to - 2,
          className: "cm-md-wikilink-resolved",
        });
        specs.push({
          kind: "mark",
          from: to - 2,
          to,
          className: BRACKET_CLASS,
        });
        continue;
      }
    }
    specs.push(spanToMark(span.start, span.end, span.kind));
  }
  for (const block of note.blockSpans) {
    specs.push(blockSpanToLineAttributes(block.startLine, block.endLine, block.kind));
  }
  return { specs, wikilinkRanges };
}

function buildDecorationSetFromSpecs(
  view: EditorView,
  specs: InlineDecorationSpec[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const spec of specs) {
    if (spec.kind === "mark") {
      if (spec.from >= doc.length) continue;
      const to = Math.min(spec.to, doc.length);
      builder.add(spec.from, to, Decoration.mark({ class: spec.className }));
    } else {
      const startLine = Math.max(1, spec.startLine);
      const endLine = Math.min(doc.lines, spec.endLine);
      for (let line = startLine; line <= endLine; line += 1) {
        const lineObj = doc.line(line);
        builder.add(lineObj.from, lineObj.from, Decoration.line({ class: spec.className }));
      }
    }
  }
  return builder.finish();
}

class InlineRenderPlugin {
  decorations!: DecorationSet;
  private getRendered: () => RenderedNote | null;
  private wikilinkRanges: WikilinkRange[] = [];

  constructor(view: EditorView, getRendered: () => RenderedNote | null) {
    this.getRendered = getRendered;
    this.rebuild(view, getRendered());
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.rebuild(update.view, this.getRendered());
    }
    if (update.selectionSet) {
      this.updateCursorClass(update.view);
    }
  }

  private rebuild(view: EditorView, note: RenderedNote | null) {
    const docText = view.state.doc.toString();
    const { specs, wikilinkRanges } = buildInlineDecorations(note, docText);
    this.wikilinkRanges = wikilinkRanges;
    this.decorations = buildDecorationSetFromSpecs(view, specs);
    this.updateCursorClass(view);
  }

  private updateCursorClass(view: EditorView) {
    const head = view.state.selection.main.head;
    const inside = this.wikilinkRanges.some(
      (r) => head >= r.from && head <= r.to,
    );
    view.dom.classList.toggle(CURSOR_INSIDE_CLASS, inside);
  }
}

export function inlineRender(getRendered: () => RenderedNote | null): Extension {
  const ext = ViewPlugin.fromClass(
    class extends InlineRenderPlugin {
      constructor(view: EditorView) {
        super(view, getRendered);
      }
    },
    { decorations: (v) => v.decorations },
  );
  (ext as unknown as { __isInlineRender: boolean }).__isInlineRender = true;
  return ext;
}

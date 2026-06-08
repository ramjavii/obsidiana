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

const MARKER_CLASS = "cm-md-marker";
const CURSOR_CLASS = "cm-formatting-cursor-inside";

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
): InlineDecorationSpec[] {
  if (note === null) return [];
  const out: InlineDecorationSpec[] = [];
  for (const span of note.inlineSpans) {
    out.push(spanToMark(span.start, span.end, span.kind));
  }
  for (const block of note.blockSpans) {
    out.push(blockSpanToLineAttributes(block.startLine, block.endLine, block.kind));
  }
  return out;
}

type MarkerSplit = {
  openFrom: number;
  openTo: number;
  contentFrom: number;
  contentTo: number;
  closeFrom: number;
  closeTo: number;
};

function splitMarkers(
  docText: string,
  from: number,
  to: number,
  kind: RenderedKind,
): MarkerSplit | null {
  if (to - from < 3) return null;
  switch (kind.kind) {
    case "strong": {
      const open = docText.slice(from, from + 2);
      const close = docText.slice(to - 2, to);
      if (open === close && (open === "**" || open === "__")) {
        return {
          openFrom: from, openTo: from + 2,
          contentFrom: from + 2, contentTo: to - 2,
          closeFrom: to - 2, closeTo: to,
        };
      }
      return null;
    }
    case "emphasis": {
      const fc = docText[from];
      const lc = docText[to - 1];
      if ((fc === "*" || fc === "_") && fc === lc &&
          docText.slice(from, from + 2) !== "**" &&
          docText.slice(to - 2, to) !== "**" &&
          docText.slice(from, from + 2) !== "__" &&
          docText.slice(to - 2, to) !== "__") {
        return {
          openFrom: from, openTo: from + 1,
          contentFrom: from + 1, contentTo: to - 1,
          closeFrom: to - 1, closeTo: to,
        };
      }
      return null;
    }
    case "strikethrough":
      return {
        openFrom: from, openTo: from + 2,
        contentFrom: from + 2, contentTo: to - 2,
        closeFrom: to - 2, closeTo: to,
      };
    case "codeInline":
      return {
        openFrom: from, openTo: from + 1,
        contentFrom: from + 1, contentTo: to - 1,
        closeFrom: to - 1, closeTo: to,
      };
    case "link": {
      const closeParen = docText.indexOf("](", from);
      if (closeParen === -1 || closeParen >= to) return null;
      return {
        openFrom: from, openTo: from + 1,
        contentFrom: from + 1, contentTo: closeParen,
        closeFrom: closeParen, closeTo: to,
      };
    }
    case "wikilinkResolved":
      return {
        openFrom: from, openTo: from + 2,
        contentFrom: from + 2, contentTo: to - 2,
        closeFrom: to - 2, closeTo: to,
      };
    default:
      return null;
  }
}

class InlineRenderPlugin {
  decorations!: DecorationSet;
  private getRendered: () => RenderedNote | null;
  private allRanges: Array<{ from: number; to: number }> = [];

  constructor(view: EditorView, getRendered: () => RenderedNote | null) {
    this.getRendered = getRendered;
    this.rebuild(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.rebuild(update.view);
    }
    if (update.selectionSet) {
      this.updateCursorClass(update.view);
    }
  }

  private rebuild(view: EditorView) {
    const note = this.getRendered();
    const docText = view.state.doc.toString();
    const builder = new RangeSetBuilder<Decoration>();
    const doc = view.state.doc;
    const ranges: Array<{ from: number; to: number }> = [];

    if (note) {
      for (const span of note.inlineSpans) {
        if (span.start >= doc.length) continue;
        const to = Math.min(span.end, doc.length);
        if (to - span.start < 1) continue;
        ranges.push({ from: span.start, to });
        const className = cssClassForKind(span.kind);
        const split = splitMarkers(docText, span.start, to, span.kind);
        if (split) {
          if (split.openFrom < split.openTo) {
            builder.add(split.openFrom, split.openTo, Decoration.mark({ class: MARKER_CLASS }));
          }
          builder.add(split.contentFrom, split.contentTo, Decoration.mark({ class: className }));
          if (split.closeFrom < split.closeTo) {
            builder.add(split.closeFrom, split.closeTo, Decoration.mark({ class: MARKER_CLASS }));
          }
        } else {
          builder.add(span.start, to, Decoration.mark({ class: className }));
        }
      }

      for (const block of note.blockSpans) {
        const startLine = Math.max(1, block.startLine);
        const endLine = Math.min(doc.lines, block.endLine);
        for (let line = startLine; line <= endLine; line += 1) {
          const lineObj = doc.line(line);
          builder.add(lineObj.from, lineObj.from, Decoration.line({ class: cssClassForKind(block.kind) }));
          ranges.push({ from: lineObj.from, to: lineObj.to });

          if (block.kind.kind === "heading") {
            const hashMatch = lineObj.text.match(/^(#{1,6})\s/);
            if (hashMatch) {
              const hashStart = lineObj.from;
              const hashEnd = lineObj.from + hashMatch[0].length;
              builder.add(hashStart, hashEnd, Decoration.mark({ class: MARKER_CLASS }));
            }
          }
        }
      }
    }

    this.allRanges = ranges;
    this.decorations = builder.finish();
    this.updateCursorClass(view);
  }

  private updateCursorClass(view: EditorView) {
    const head = view.state.selection.main.head;
    const inside = this.allRanges.some(
      (r) => head >= r.from && head <= r.to,
    );
    view.dom.classList.toggle(CURSOR_CLASS, inside);
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

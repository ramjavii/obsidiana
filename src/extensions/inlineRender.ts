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

function buildDecorationSet(view: EditorView, note: RenderedNote | null): DecorationSet {
  const specs = buildInlineDecorations(note);
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
  decorations: DecorationSet;
  private getRendered: () => RenderedNote | null;

  constructor(view: EditorView, getRendered: () => RenderedNote | null) {
    this.getRendered = getRendered;
    this.decorations = buildDecorationSet(view, getRendered());
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildDecorationSet(update.view, this.getRendered());
    }
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

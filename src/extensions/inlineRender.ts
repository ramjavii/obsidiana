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

export const MARKER_CLASS = "cm-md-marker";
export const CURSOR_CLASS = "cm-formatting-cursor-inside-inline";

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

/** Find all formatting-marker positions in `doc` using frontend regexes
 *  (always correct UTF-16 code unit indices). */
export function findMarkers(doc: string): Array<{ from: number; to: number }> {
  const markers: Array<{ from: number; to: number }> = [];

  // Bold: **text**
  let re = /\*\*(.+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + 2 });
    markers.push({ from: m.index + m[0].length - 2, to: m.index + m[0].length });
  }

  // Italic: *text* where bare *
  re = /(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + 1 });
    markers.push({ from: m.index + m[0].length - 1, to: m.index + m[0].length });
  }

  // Bold: __text__
  re = /__(.+?)__/g;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + 2 });
    markers.push({ from: m.index + m[0].length - 2, to: m.index + m[0].length });
  }

  // Italic: _text_ where not __
  re = /(?<!_)_(?!_)([^_]+?)(?<!_)_(?!_)/g;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + 1 });
    markers.push({ from: m.index + m[0].length - 1, to: m.index + m[0].length });
  }

  // Strikethrough: ~~text~~
  re = /~~(.+?)~~/g;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + 2 });
    markers.push({ from: m.index + m[0].length - 2, to: m.index + m[0].length });
  }

  // Inline code: `text`
  re = /`([^`]+?)`/g;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + 1 });
    markers.push({ from: m.index + m[0].length - 1, to: m.index + m[0].length });
  }

  // Heading: # at start of line
  re = /^(#{1,6})\s/gm;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + m[0].length });
  }

  // Markdown link: [text](url)
  re = /\[([^\]]+)\]\(([^)]*)\)/g;
  while ((m = re.exec(doc)) !== null) {
    markers.push({ from: m.index, to: m.index + 1 });
    const closeBracket = m.index + m[0].indexOf("](");
    markers.push({ from: closeBracket, to: m.index + m[0].length });
  }

  return markers;
}

/** Build a sorted array of disjoint ranges where marker hiding is
 *  suppressed (inside code blocks or inline code). */
function buildCodeRanges(
  note: RenderedNote | null,
  doc: { lines: number; line: (n: number) => { from: number; to: number } },
): Array<{ from: number; to: number }> {
  if (note === null) return [];
  const ranges: Array<{ from: number; to: number }> = [];

  for (const span of note.inlineSpans) {
    if (span.kind.kind === "codeInline") {
      ranges.push({ from: span.start, to: span.end });
    }
  }
  for (const block of note.blockSpans) {
    if (block.kind.kind !== "codeBlock") continue;
    const startLine = Math.max(1, block.startLine);
    const endLine = Math.min(doc.lines, block.endLine);
    for (let line = startLine; line <= endLine; line += 1) {
      const lineObj = doc.line(line);
      ranges.push({ from: lineObj.from, to: lineObj.to });
    }
  }

  ranges.sort((a, b) => a.from - b.from);
  return ranges;
}

function isInsideRanges(
  pos: number,
  ranges: Array<{ from: number; to: number }>,
): boolean {
  let lo = 0;
  let hi = ranges.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid]!;
    if (pos < r.from) {
      hi = mid;
    } else if (pos >= r.to) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
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

    const codeRanges = buildCodeRanges(note, doc);

    const markers = findMarkers(docText);
    for (const m of markers) {
      if (isInsideRanges(m.from, codeRanges)) continue;
      builder.add(m.from, m.to, Decoration.mark({ class: MARKER_CLASS }));
    }

    if (note) {
      for (const span of note.inlineSpans) {
        if (span.kind.kind === "wikilinkResolved") continue;
        if (span.start >= doc.length) continue;
        const to = Math.min(span.end, doc.length);
        if (to - span.start < 1) continue;
        ranges.push({ from: span.start, to });
        const className = cssClassForKind(span.kind);
        builder.add(span.start, to, Decoration.mark({ class: className }));
      }

      for (const block of note.blockSpans) {
        const startLine = Math.max(1, block.startLine);
        const endLine = Math.min(doc.lines, block.endLine);
        for (let line = startLine; line <= endLine; line += 1) {
          const lineObj = doc.line(line);
          builder.add(lineObj.from, lineObj.from, Decoration.line({ class: cssClassForKind(block.kind) }));
          ranges.push({ from: lineObj.from, to: lineObj.to });
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

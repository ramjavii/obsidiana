import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import type { ResolvedLink } from "@/types/markdown";

export const WIKILINK_PATTERN =
  /(?<!!)\[\[(\S[^[\]\n|]*)(?:\|([^[\]\n]+))?\]\]/g;

export type WikilinkState = "unresolved" | "resolved" | "broken";

export type WikilinkClickActions = {
  onJump: (resolvedPath: string, section: string | null) => void;
  onBrokenClick: (target: string, sourcePath: string, alias: string | null) => void;
  getState: (target: string, alias: string | null) => ResolvedLink | null;
  getSourcePath: () => string;
};

const DATA_TARGET = "data-wikilink-target";
const DATA_ALIAS = "data-wikilink-alias";
const CURSOR_INSIDE_CLASS = "cm-formatting-cursor-inside";

function buildAttributes(target: string, alias: string | null): Record<string, string> {
  const attrs: Record<string, string> = { [DATA_TARGET]: target };
  if (alias !== null) attrs[DATA_ALIAS] = alias;
  return attrs;
}

function stateClass(state: WikilinkState): string {
  return `cm-wikilink cm-wikilink-${state}`;
}

type WikilinkRange = { from: number; to: number };

class WikilinkHighlightPlugin {
  decorations!: DecorationSet;
  private getState: WikilinkClickActions["getState"];
  private wikilinkRanges: WikilinkRange[] = [];

  constructor(view: EditorView, getState: WikilinkClickActions["getState"]) {
    this.getState = getState;
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
    const doc = view.state.doc.toString();
    const builder = new RangeSetBuilder<Decoration>();
    const ranges: WikilinkRange[] = [];

    const re = new RegExp(WIKILINK_PATTERN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(doc)) !== null) {
      const from = match.index;
      const to = from + match[0].length;
      const target = match[1] ?? "";
      const alias = match[2] ?? null;
      const link = alias ? this.getState(target, alias) : this.getState(target, null);
      let state: WikilinkState = "unresolved";
      if (link) state = link.kind === "resolved" ? "resolved" : "broken";

      const attrs: Record<string, string> = buildAttributes(target, alias);
      if (state === "broken") {
        attrs.title = "Broken link — click to create this note";
      }
      if (state === "resolved") {
        attrs.title = "Click to navigate";
      }

      ranges.push({ from, to });

      const bracketClass = "cm-wikilink cm-wikilink-bracket";
      builder.add(from, from + 2, Decoration.mark({ class: bracketClass, attributes: attrs }));
      builder.add(to - 2, to, Decoration.mark({ class: bracketClass, attributes: attrs }));
      builder.add(from + 2, to - 2, Decoration.mark({ class: stateClass(state), attributes: attrs }));
    }

    this.wikilinkRanges = ranges;
    this.decorations = builder.finish();
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

export function wikilinkHighlight(
  getState: WikilinkClickActions["getState"],
): Extension {
  return ViewPlugin.fromClass(
    class extends WikilinkHighlightPlugin {
      constructor(view: EditorView) {
        super(view, getState);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function findDecorationElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) return null;
  if (!(target instanceof HTMLElement)) return null;
  const el = target.closest<HTMLElement>(`.${"cm-wikilink"}`);
  return el;
}

function readDecorationAttrs(
  el: HTMLElement,
): { target: string; alias: string | null } | null {
  const target = el.getAttribute(DATA_TARGET);
  if (target === null) return null;
  const alias = el.getAttribute(DATA_ALIAS);
  return { target, alias };
}

export function buildWikilinkClickHandler(
  actions: WikilinkClickActions,
): (e: MouseEvent, eventName: "mousedown" | "click") => boolean {
  return (event: MouseEvent, _eventName: "mousedown" | "click") => {
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    const el = findDecorationElement(event.target);
    if (el === null) return false;
    const attrs = readDecorationAttrs(el);
    if (attrs === null) return false;
    const alias = attrs.alias;
    const link = alias ? actions.getState(attrs.target, alias) : actions.getState(attrs.target, null);
    if (link === null) return false;
    if (link.kind === "resolved") {
      actions.onJump(link.resolvedPath, link.section);
    } else {
      actions.onBrokenClick(link.target, actions.getSourcePath(), link.alias ?? alias ?? null);
    }
    event.preventDefault();
    return true;
  };
}

export const WIKILINK_CLICK_HANDLER = (
  actions: WikilinkClickActions,
): Extension =>
  EditorView.domEventHandlers({
    mousedown: (event, _view) => buildWikilinkClickHandler(actions)(event, "mousedown"),
    click: (event, _view) => buildWikilinkClickHandler(actions)(event, "click"),
  });

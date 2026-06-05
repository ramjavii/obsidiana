import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

export const WIKILINK_PATTERN =
  /(?<!!)\[\[(\S[^[\]\n|]*)(?:\|([^[\]\n]+))?\]\]/g;

const decorator = new MatchDecorator({
  regexp: WIKILINK_PATTERN,
  decoration: () =>
    Decoration.mark({ class: "cm-wikilink cm-wikilink-unresolved" }),
});

class WikilinkHighlightPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = decorator.createDeco(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = decorator.updateDeco(update, this.decorations);
    }
  }
}

export const wikilinkHighlight = ViewPlugin.fromClass(WikilinkHighlightPlugin, {
  decorations: (v) => v.decorations,
});

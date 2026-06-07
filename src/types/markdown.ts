export type WikilinkRef = {
  target: string;
  alias: string | null;
  line: number;
};

export type ResolvedLink =
  | {
      kind: "resolved";
      target: string;
      sourcePath: string;
      resolvedPath: string;
      section: string | null;
      alias: string | null;
    }
  | {
      kind: "broken";
      target: string;
      sourcePath: string;
      section: string | null;
      alias: string | null;
    };

export type ResolveWikilinkInput = {
  target: string;
  sourcePath: string;
  alias?: string | null;
};

export type RenderedKind =
  | { kind: "strong" }
  | { kind: "emphasis" }
  | { kind: "strikethrough" }
  | { kind: "heading"; level: number }
  | { kind: "codeInline" }
  | { kind: "codeBlock" }
  | { kind: "link" }
  | { kind: "wikilinkResolved" };

export type RenderedSpan = {
  start: number;
  end: number;
  kind: RenderedKind;
};

export type RenderedBlockSpan = {
  startLine: number;
  endLine: number;
  kind: RenderedKind;
};

export type RenderedNote = {
  html: string;
  inlineSpans: RenderedSpan[];
  blockSpans: RenderedBlockSpan[];
};

export type TagRef = {
  name: string;
  line: number;
};

export type GetTagsInput = {
  path: string;
};

export type BacklinkRef = {
  sourcePath: string;
  sourceTitle: string;
  kind: string;
  blockId: string | null;
};

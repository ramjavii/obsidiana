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

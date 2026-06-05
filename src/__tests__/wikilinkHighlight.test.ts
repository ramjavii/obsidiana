import { describe, it, expect } from "vitest";
import { WIKILINK_PATTERN } from "@/extensions/wikilinkHighlight";

function findAll(
  text: string,
): { match: string; target: string; alias: string | null; from: number }[] {
  const re = new RegExp(WIKILINK_PATTERN.source, WIKILINK_PATTERN.flags);
  const out: { match: string; target: string; alias: string | null; from: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({
      match: m[0],
      target: m[1] ?? "",
      alias: m[2] ?? null,
      from: m.index,
    });
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return out;
}

describe("WIKILINK_PATTERN", () => {
  it("matches a bare [[note]] and captures the target", () => {
    const hits = findAll("See [[note]] here");
    expect(hits).toEqual([
      { match: "[[note]]", target: "note", alias: null, from: 4 },
    ]);
  });

  it("matches [[note|alias]] and captures both", () => {
    const hits = findAll("See [[note|My Note]] here");
    expect(hits).toEqual([
      { match: "[[note|My Note]]", target: "note", alias: "My Note", from: 4 },
    ]);
  });

  it("excludes ![[embed]] via the lookbehind", () => {
    const hits = findAll("![[embed]] but [[link]] is real");
    expect(hits).toEqual([
      { match: "[[link]]", target: "link", alias: null, from: 15 },
    ]);
  });

  it("handles a mix of bare, aliased, and embed in one line", () => {
    const hits = findAll("[[a]] and ![[b]] and [[c|d]]");
    expect(hits).toEqual([
      { match: "[[a]]", target: "a", alias: null, from: 0 },
      { match: "[[c|d]]", target: "c", alias: "d", from: 21 },
    ]);
  });

  it("does not match an empty target [[ ]]", () => {
    const hits = findAll("[[ ]] and [[real]]");
    expect(hits).toEqual([
      { match: "[[real]]", target: "real", alias: null, from: 10 },
    ]);
  });

  it("does not match a target containing a newline", () => {
    const hits = findAll("[[a\nb]] and [[ok]]");
    expect(hits).toEqual([
      { match: "[[ok]]", target: "ok", alias: null, from: 12 },
    ]);
  });
});

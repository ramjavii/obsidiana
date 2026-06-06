import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  extractWikilinks as extractWikilinksIpc,
  renderMarkdown as renderMarkdownIpc,
  resolveWikilink as resolveWikilinkIpc,
} from "@/ipc/markdown";
import type { RenderedNote, ResolvedLink, WikilinkRef } from "@/types/markdown";

export const renderMarkdownKey = (path: string) =>
  ["markdown", "render", path] as const;

export function useRenderMarkdown(
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery<RenderedNote>({
    queryKey: renderMarkdownKey(path),
    queryFn: () => renderMarkdownIpc(path),
    enabled: options?.enabled ?? true,
    staleTime: 5_000,
  });
}

export const wikilinksKey = (path: string) =>
  ["markdown", "wikilinks", path] as const;

export function useExtractWikilinks(
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery<WikilinkRef[]>({
    queryKey: wikilinksKey(path),
    queryFn: () => extractWikilinksIpc(path),
    enabled: options?.enabled ?? true,
    staleTime: 5_000,
  });
}

export const resolveWikilinkKey = (input: {
  target: string;
  sourcePath: string;
  alias?: string | null;
}) =>
  [
    "markdown",
    "resolve",
    input.sourcePath,
    input.target,
    input.alias ?? null,
  ] as const;

export function useResolveWikilink(
  input: { target: string; sourcePath: string; alias?: string | null },
  options?: { enabled?: boolean },
) {
  return useQuery<ResolvedLink>({
    queryKey: resolveWikilinkKey(input),
    queryFn: () =>
      resolveWikilinkIpc(input.sourcePath, input.target, input.alias ?? null),
    enabled: options?.enabled ?? true,
    staleTime: 5_000,
  });
}

export function wikilinkMapKey(target: string, alias: string | null): string {
  return `${target}::${alias ?? ""}`;
}

export function useWikilinkResolutionMap(
  sourcePath: string,
  wikilinks: WikilinkRef[],
): Map<string, ResolvedLink> {
  const unique = useMemo(() => {
    const seen = new Set<string>();
    const out: WikilinkRef[] = [];
    for (const w of wikilinks) {
      const key = wikilinkMapKey(w.target, w.alias);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
    return out;
  }, [wikilinks]);

  const queries = useQueries({
    queries: unique.map((w) => ({
      queryKey: resolveWikilinkKey({
        target: w.target,
        sourcePath,
        alias: w.alias,
      }),
      queryFn: () => resolveWikilinkIpc(sourcePath, w.target, w.alias),
      staleTime: 5_000,
    })),
  });

  return useMemo(() => {
    const map = new Map<string, ResolvedLink>();
    unique.forEach((w, i) => {
      const data = queries[i]?.data;
      if (data) {
        map.set(wikilinkMapKey(w.target, w.alias), data);
      }
    });
    return map;
  }, [unique, queries]);
}

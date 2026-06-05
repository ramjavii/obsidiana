import { useQuery } from "@tanstack/react-query";
import {
  extractWikilinks as extractWikilinksIpc,
  resolveWikilink as resolveWikilinkIpc,
} from "@/ipc/markdown";
import type { ResolvedLink, WikilinkRef } from "@/types/markdown";

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

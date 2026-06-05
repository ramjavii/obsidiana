import { useQuery } from "@tanstack/react-query";
import { extractWikilinks as extractWikilinksIpc } from "@/ipc/markdown";
import type { WikilinkRef } from "@/types/markdown";

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

import { ipcInvoke } from "@/ipc";
import type { ResolvedLink, WikilinkRef } from "@/types/markdown";

export async function extractWikilinks(path: string): Promise<WikilinkRef[]> {
  const result = await ipcInvoke<WikilinkRef[]>("extract_wikilinks", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function resolveWikilink(
  sourcePath: string,
  target: string,
  alias: string | null,
): Promise<ResolvedLink> {
  const result = await ipcInvoke<ResolvedLink>("resolve_wikilink", {
    sourcePath,
    target,
    alias,
  });
  if (!result.ok) throw result.error;
  return result.value;
}

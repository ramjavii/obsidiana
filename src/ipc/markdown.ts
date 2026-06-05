import { ipcInvoke } from "@/ipc";
import type { WikilinkRef } from "@/types/markdown";

export async function extractWikilinks(path: string): Promise<WikilinkRef[]> {
  const result = await ipcInvoke<WikilinkRef[]>("extract_wikilinks", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

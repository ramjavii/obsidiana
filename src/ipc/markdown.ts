import { ipcInvoke } from "@/ipc";
import type { RenderedNote, ResolvedLink, TagRef, WikilinkRef } from "@/types/markdown";

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

export async function renderMarkdown(path: string): Promise<RenderedNote> {
  const result = await ipcInvoke<RenderedNote>("render_markdown", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function getTagsForNote(path: string): Promise<TagRef[]> {
  const result = await ipcInvoke<TagRef[]>("get_tags_for_note", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

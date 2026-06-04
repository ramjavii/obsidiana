import { ipcInvoke } from "@/ipc";
import type { NoteContent, RenameReport, TreeNode } from "@/types/tree";

export async function listTree(path: string | null): Promise<TreeNode[]> {
  const result = await ipcInvoke<TreeNode[]>("list_tree", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function createNote(
  path: string,
  template: string | null,
): Promise<NoteContent> {
  const result = await ipcInvoke<NoteContent>("create_note", { path, template });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function deleteNote(path: string): Promise<void> {
  const result = await ipcInvoke<void>("delete_note", { path });
  if (!result.ok) throw result.error;
}

export async function renameNote(from: string, to: string): Promise<RenameReport> {
  const result = await ipcInvoke<RenameReport>("rename_note", { from, to });
  if (!result.ok) throw result.error;
  return result.value;
}

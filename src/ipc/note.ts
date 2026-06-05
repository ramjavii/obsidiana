import { ipcInvoke } from "@/ipc";
import type { NoteContent } from "@/types/tree";
import type { WriteResult } from "@/types/note";

export async function readNote(path: string): Promise<NoteContent> {
  const result = await ipcInvoke<NoteContent>("read_note", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function writeNote(path: string, content: string): Promise<WriteResult> {
  const result = await ipcInvoke<WriteResult>("write_note", { path, content });
  if (!result.ok) throw result.error;
  return result.value;
}

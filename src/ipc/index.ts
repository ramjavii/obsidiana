import { ipcInvoke } from "@/ipc";
import type { IndexStatus } from "@/types/index";

export async function getIndexStatus(): Promise<IndexStatus> {
  const result = await ipcInvoke<IndexStatus>("index_status");
  if (!result.ok) throw result.error;
  return result.value;
}

export async function rebuildIndex(): Promise<void> {
  const result = await ipcInvoke<void>("rebuild_index");
  if (!result.ok) throw result.error;
}

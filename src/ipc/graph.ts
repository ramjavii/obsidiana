import { ipcInvoke } from "@/ipc";
import type { GraphData } from "@/types/index";

export async function getGraphSnapshot(): Promise<GraphData> {
  const result = await ipcInvoke<GraphData>("graph_snapshot");
  if (!result.ok) throw result.error;
  return result.value;
}

import { ipcInvoke } from "@/ipc";
import type { RecentVault, VaultInfo } from "@/types/vault";

export async function pickVault(): Promise<VaultInfo | null> {
  const result = await ipcInvoke<VaultInfo | null>("pick_vault");
  if (!result.ok) throw result.error;
  return result.value;
}

export async function openVault(path: string): Promise<VaultInfo> {
  const result = await ipcInvoke<VaultInfo>("open_vault", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function openVaultForce(path: string): Promise<VaultInfo> {
  const result = await ipcInvoke<VaultInfo>("open_vault_force", { path });
  if (!result.ok) throw result.error;
  return result.value;
}

export async function closeVault(): Promise<void> {
  const result = await ipcInvoke<void>("close_vault");
  if (!result.ok) throw result.error;
}

export async function listRecentVaults(): Promise<RecentVault[]> {
  const result = await ipcInvoke<RecentVault[]>("list_recent_vaults");
  if (!result.ok) throw result.error;
  return result.value;
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closeVault as closeVaultIpc,
  getOpenVault as getOpenVaultIpc,
  listRecentVaults,
  openVault as openVaultIpc,
  openVaultForce as openVaultForceIpc,
  pickVault as pickVaultIpc,
} from "@/ipc/vault";
import { reportAppError } from "@/hooks/useToastStore";
import { isAppError } from "@/errors";
import type { RecentVault, VaultInfo, VaultStatus } from "@/types/vault";

const VAULT_STATUS_KEY = ["vault", "status"] as const;

function statusFromRecents(recents: RecentVault[]): VaultStatus {
  const first = recents.find((r) => r.available);
  if (!first) return { kind: "none" };
  return {
    kind: "open",
    vault: { name: first.name, path: first.path },
  };
}

export function useVaultStatus() {
  const query = useQuery({
    queryKey: VAULT_STATUS_KEY,
    queryFn: async () => {
      try {
        const open = await getOpenVaultIpc();
        if (open !== null) {
          return { kind: "open" as const, vault: open };
        }
      } catch (err) {
        if (isAppError(err)) reportAppError(err);
        return { kind: "none" as const };
      }
      const recents = await listRecentVaults();
      const target = recents.find((r) => r.available);
      if (!target) {
        return { kind: "none" as const };
      }
      try {
        const info = await openVaultIpc(target.path);
        return { kind: "open" as const, vault: info };
      } catch (err) {
        if (isAppError(err)) reportAppError(err);
        return { kind: "none" as const };
      }
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    status: query.data ?? ({ kind: "none" } as VaultStatus),
  };
}

function useVaultMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  onSuccess?: (result: TResult) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      try {
        return await fn(args);
      } catch (err) {
        if (isAppError(err)) reportAppError(err);
        throw err;
      }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: VAULT_STATUS_KEY });
      onSuccess?.(result);
    },
  });
}

export function usePickVaultMutation() {
  return useVaultMutation<undefined, VaultInfo | null>(async () => {
    return pickVaultIpc();
  });
}

export function useOpenVaultMutation() {
  return useVaultMutation<string, VaultInfo>(openVaultIpc);
}

export function useOpenVaultForceMutation() {
  return useVaultMutation<string, VaultInfo>(openVaultForceIpc);
}

export function useCloseVaultMutation() {
  return useVaultMutation<undefined, void>(async () => {
    await closeVaultIpc();
  });
}

export { statusFromRecents };


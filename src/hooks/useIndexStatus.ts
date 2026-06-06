import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getIndexStatus as getIndexStatusIpc,
  rebuildIndex as rebuildIndexIpc,
} from "@/ipc/index";
import { reportAppError } from "@/hooks/useToastStore";
import type { AppError } from "@/errors";
import type { IndexStatus } from "@/types/index";

export const indexStatusKey = () => ["index", "status"] as const;

export function useIndexStatus(options?: { enabled?: boolean }) {
  return useQuery<IndexStatus, AppError>({
    queryKey: indexStatusKey(),
    queryFn: () => getIndexStatusIpc(),
    enabled: options?.enabled ?? true,
    staleTime: 2_000,
    refetchInterval: 2_000,
    refetchOnWindowFocus: false,
  });
}

export function useRebuildIndexMutation() {
  const qc = useQueryClient();
  return useMutation<void, AppError, void>({
    mutationFn: () => rebuildIndexIpc(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: indexStatusKey() });
    },
    onError: (err) => {
      reportAppError(err);
    },
  });
}

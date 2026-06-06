import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNote as createNoteIpc,
  deleteNote as deleteNoteIpc,
  listTree as listTreeIpc,
  renameNote as renameNoteIpc,
} from "@/ipc/tree";
import { reportAppError } from "@/hooks/useToastStore";
import { isAppError } from "@/errors";
import type { NoteContent, RenameReport, TreeNode } from "@/types/tree";

export const treeChildrenKey = (path: string | null) =>
  ["tree", "children", path] as const;

export function parentOf(path: string): string | null {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? null : path.slice(0, idx);
}

export function useTreeChildren(
  path: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<TreeNode[]>({
    queryKey: treeChildrenKey(path),
    queryFn: async () => listTreeIpc(path),
    enabled: options?.enabled ?? true,
    staleTime: 5_000,
  });
}

function useTreeMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  invalidate: (args: TArgs, result: TResult) => Array<string | null>,
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
    onSuccess: (result, args) => {
      for (const key of invalidate(args, result)) {
        void queryClient.invalidateQueries({ queryKey: treeChildrenKey(key) });
      }
    },
  });
}

export function useCreateNoteMutation() {
  return useTreeMutation<{ path: string; template: string | null }, NoteContent>(
    ({ path, template }) => createNoteIpc(path, template),
    ({ path }) => [parentOf(path)],
  );
}

export function useDeleteNoteMutation() {
  return useTreeMutation<{ path: string }, void>(
    ({ path }) => deleteNoteIpc(path),
    ({ path }) => [parentOf(path)],
  );
}

export function useRenameNoteMutation() {
  return useTreeMutation<{ from: string; to: string }, RenameReport>(
    ({ from, to }) => renameNoteIpc(from, to),
    ({ from, to }) => Array.from(new Set([parentOf(from), parentOf(to)])),
  );
}

export function withNoteExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return name;
  return `${name}.md`;
}

export function brokenWikilinkPath(
  target: string,
  sourcePath: string,
): string {
  const fileName = withNoteExtension(target);
  const dir = parentOf(sourcePath);
  return dir ? `${dir}/${fileName}` : fileName;
}

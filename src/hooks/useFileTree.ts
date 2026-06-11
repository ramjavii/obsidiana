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

export function useCreateNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      path,
      template,
    }: {
      path: string;
      template: string | null;
    }): Promise<NoteContent> => {
      try {
        return await createNoteIpc(path, template);
      } catch (err) {
        if (isAppError(err)) reportAppError(err);
        throw err;
      }
    },
    onSuccess: (_, { path }) => {
      void queryClient.invalidateQueries({ queryKey: treeChildrenKey(parentOf(path)) });
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}

export function useDeleteNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      try {
        return await deleteNoteIpc(path);
      } catch (err) {
        if (isAppError(err)) reportAppError(err);
        throw err;
      }
    },
    onSuccess: (_, { path }) => {
      void queryClient.invalidateQueries({ queryKey: treeChildrenKey(parentOf(path)) });
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}

export function useRenameNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }): Promise<RenameReport> => {
      try {
        return await renameNoteIpc(from, to);
      } catch (err) {
        if (isAppError(err)) reportAppError(err);
        throw err;
      }
    },
    onSuccess: (_, { from, to }) => {
      for (const key of Array.from(new Set([parentOf(from), parentOf(to)]))) {
        void queryClient.invalidateQueries({ queryKey: treeChildrenKey(key) });
      }
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
    },
  });
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

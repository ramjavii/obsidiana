import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readNote as readNoteIpc, writeNote as writeNoteIpc } from "@/ipc/note";
import { reportAppError } from "@/hooks/useToastStore";
import { treeChildrenKey, parentOf } from "@/hooks/useFileTree";
import type { NoteContent } from "@/types/tree";
import type { WriteResult } from "@/types/note";

export const noteKey = (path: string) => ["note", "read", path] as const;

export function useReadNote(
  path: string,
  options?: { enabled?: boolean },
) {
  return useQuery<NoteContent>({
    queryKey: noteKey(path),
    queryFn: () => readNoteIpc(path),
    enabled: options?.enabled ?? true,
    staleTime: 5_000,
  });
}

export function useWriteNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    WriteResult,
    unknown,
    { path: string; content: string },
    { previousNote: NoteContent | undefined }
  >({
    mutationFn: async ({ path, content }) => {
      try {
        return await writeNoteIpc(path, content);
      } catch (err) {
        if (err && typeof err === "object" && "kind" in err) {
          reportAppError(err as Parameters<typeof reportAppError>[0]);
        }
        throw err;
      }
    },
    onMutate: async ({ path, content }) => {
      const previousNote = queryClient.getQueryData<NoteContent>(noteKey(path));
      queryClient.setQueryData<NoteContent>(noteKey(path), {
        path,
        content,
        modifiedAt: previousNote?.modifiedAt ?? new Date().toISOString(),
      });
      return { previousNote };
    },
    onError: (_err, { path }, context) => {
      if (context?.previousNote) {
        queryClient.setQueryData(noteKey(path), context.previousNote);
      }
    },
    onSuccess: (_result, { path }) => {
      void queryClient.invalidateQueries({
        queryKey: treeChildrenKey(parentOf(path)),
      });
    },
  });
}

import { useGetTagsForNote } from "@/hooks/useMarkdown";
import { TagList } from "@/components/TagList";
import { appErrorMessage } from "@/errors";

type Props = { path: string };

export function TagsPanel({ path }: Props) {
  const query = useGetTagsForNote(path);
  const tags = query.data ?? [];

  return (
    <section
      data-testid="tags-panel"
      data-tags-path={path}
      className="flex h-full flex-col gap-2 overflow-auto p-3"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Tags
        </h2>
        <span data-testid="tags-count" className="text-xs text-zinc-500">
          {query.isPending ? "…" : `${tags.length}`}
        </span>
      </header>
      {query.isError ? (
        <p data-testid="tags-error" className="text-xs text-rose-400">
          {appErrorMessage(query.error)}
        </p>
      ) : (
        <TagList tags={tags} />
      )}
    </section>
  );
}

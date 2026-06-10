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
      className="flex h-full flex-col gap-2 overflow-auto p-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Tags
        </h2>
        <span data-testid="tags-count" className="text-[11px] font-mono text-zinc-600">
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

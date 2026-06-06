import { TagChip } from "@/components/TagChip";
import type { TagRef } from "@/types/markdown";

type Props = {
  tags: TagRef[];
  onTagClick?: ((name: string) => void) | undefined;
  emptyText?: string;
};

export function TagList({ tags, onTagClick, emptyText = "No tags" }: Props) {
  if (tags.length === 0) {
    return (
      <p data-testid="tag-list-empty" className="text-xs text-zinc-500">
        {emptyText}
      </p>
    );
  }
  return (
    <div data-testid="tag-list" className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <TagChip key={`${t.name}-${t.line}`} tag={t} onClick={onTagClick} />
      ))}
    </div>
  );
}

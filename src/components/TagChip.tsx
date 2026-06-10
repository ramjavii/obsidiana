import type { TagRef } from "@/types/markdown";

type Props = {
  tag: TagRef;
  onClick?: ((name: string) => void) | undefined;
};

export function TagChip({ tag, onClick }: Props) {
  const className =
    "tag-chip inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors duration-150";
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={`tag-chip-${tag.name}`}
        className={className}
        onClick={() => onClick(tag.name)}
      >
        #{tag.name}
      </button>
    );
  }
  return (
    <span data-testid={`tag-chip-${tag.name}`} className={className}>
      #{tag.name}
    </span>
  );
}

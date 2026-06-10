import type { BacklinkRef } from "@/types/markdown";

type Props = {
  backlink: BacklinkRef;
  onClick?: (sourcePath: string) => void;
};

export function BacklinkItem({ backlink, onClick }: Props) {
  return (
    <button
      type="button"
      data-testid="backlink-item"
      onClick={() => onClick?.(backlink.sourcePath)}
      className="w-full rounded px-2 py-1 text-left text-xs text-zinc-200 transition-colors duration-150 hover:bg-zinc-800"
    >
      <span className="block truncate font-medium">{backlink.sourceTitle}</span>
      <span className="block truncate text-zinc-500">{backlink.sourcePath}</span>
    </button>
  );
}

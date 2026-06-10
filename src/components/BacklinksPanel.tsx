import { useGetBacklinks } from "@/hooks/useMarkdown";
import { BacklinkItem } from "@/components/BacklinkItem";
import { appErrorMessage } from "@/errors";

type Props = {
  path: string;
  onNavigate?: (sourcePath: string) => void;
};

export function BacklinksPanel({ path, onNavigate }: Props) {
  const query = useGetBacklinks(path);
  const backlinks = query.data ?? [];

  return (
    <section
      data-testid="backlinks-panel"
      data-backlinks-path={path}
      className="flex h-full flex-col gap-2 overflow-auto p-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Backlinks
        </h2>
        <span data-testid="backlinks-count" className="text-[11px] font-mono text-zinc-600">
          {query.isPending ? "…" : `${backlinks.length}`}
        </span>
      </header>
      {query.isError ? (
        <p data-testid="backlinks-error" className="text-xs text-rose-400">
          {appErrorMessage(query.error)}
        </p>
      ) : backlinks.length === 0 ? (
        <p data-testid="backlinks-empty" className="text-xs text-zinc-500">
          No backlinks
        </p>
      ) : (
        <div data-testid="backlinks-list" className="flex flex-col gap-1">
          {backlinks.map((bl) => (
            <BacklinkItem
              key={bl.sourcePath}
              backlink={bl}
              {...(onNavigate ? { onClick: onNavigate } : {})}
            />
          ))}
        </div>
      )}
    </section>
  );
}

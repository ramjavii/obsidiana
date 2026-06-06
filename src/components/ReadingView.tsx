type Props = {
  path: string;
  html: string;
};

export function ReadingView({ path, html }: Props) {
  return (
    <div
      data-testid="reading-view"
      className="reading-view flex h-full flex-col overflow-hidden bg-zinc-950"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <span
          data-testid="reading-view-path"
          className="text-sm font-medium text-zinc-200"
        >
          {path}
        </span>
        <span className="ml-auto text-xs text-zinc-500">Reading view</span>
      </div>
      <div
        data-testid="reading-view-body"
        className="reading-view-body flex-1 overflow-auto px-8 py-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

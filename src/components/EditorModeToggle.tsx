import { useEditorModeStore, type EditorMode } from "@/hooks/useEditorModeStore";

const OPTIONS: Array<{ mode: EditorMode; label: string }> = [
  { mode: "source", label: "Source" },
  { mode: "livePreview", label: "Live Preview" },
  { mode: "reading", label: "Reading view" },
];

export function EditorModeToggle() {
  const mode = useEditorModeStore((s) => s.mode);
  const setMode = useEditorModeStore((s) => s.setMode);
  return (
    <div
      role="group"
      aria-label="Editor mode"
      data-testid="editor-mode-toggle"
      className="inline-flex overflow-hidden rounded border border-zinc-700"
    >
      {OPTIONS.map(({ mode: optionMode, label }) => {
        const active = optionMode === mode;
        return (
          <button
            key={optionMode}
            type="button"
            data-testid={`mode-toggle-${optionMode}`}
            data-active={active ? "true" : "false"}
            onClick={() => setMode(optionMode)}
            className={
              active
                ? "bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-100"
                : "px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-900"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

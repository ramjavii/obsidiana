import { create } from "zustand";

export type EditorMode = "source" | "livePreview" | "reading";

const EDITOR_MODES: readonly EditorMode[] = ["source", "livePreview", "reading"];

export function isEditorMode(value: unknown): value is EditorMode {
  return typeof value === "string" && (EDITOR_MODES as readonly string[]).includes(value);
}

type EditorModeState = {
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;
};

export const useEditorModeStore = create<EditorModeState>((set) => ({
  mode: "livePreview",
  setMode: (mode) => {
    if (!isEditorMode(mode)) return;
    set({ mode });
  },
}));

import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useEditorModeStore,
  type EditorMode,
} from "@/hooks/useEditorModeStore";

const MODES: EditorMode[] = ["source", "livePreview", "reading"];

describe("useEditorModeStore", () => {
  beforeEach(() => {
    useEditorModeStore.setState({ mode: "livePreview" });
  });

  it("defaults to livePreview mode", () => {
    const { result } = renderHook(() => useEditorModeStore((s) => s.mode));
    expect(result.current).toBe("livePreview");
  });

  it("exposes setMode that updates the mode to source", () => {
    const { result } = renderHook(() => useEditorModeStore());
    act(() => {
      result.current.setMode("source");
    });
    expect(result.current.mode).toBe("source");
  });

  it("exposes setMode that updates the mode to reading", () => {
    const { result } = renderHook(() => useEditorModeStore());
    act(() => {
      result.current.setMode("reading");
    });
    expect(result.current.mode).toBe("reading");
  });

  it("exposes setMode that updates the mode to livePreview", () => {
    const { result } = renderHook(() => useEditorModeStore());
    act(() => {
      result.current.setMode("source");
    });
    expect(result.current.mode).toBe("source");
    act(() => {
      result.current.setMode("livePreview");
    });
    expect(result.current.mode).toBe("livePreview");
  });

  it("supports all three EditorMode values", () => {
    expect(MODES).toContain(useEditorModeStore.getState().mode);
    for (const mode of MODES) {
      useEditorModeStore.getState().setMode(mode);
      expect(useEditorModeStore.getState().mode).toBe(mode);
    }
  });
});

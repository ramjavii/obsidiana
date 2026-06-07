import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEditorModeStore } from "@/hooks/useEditorModeStore";

describe("useEditorModeStore", () => {
  it("defaults to livePreview mode", () => {
    const { result } = renderHook(() => useEditorModeStore((s) => s.mode));
    expect(result.current).toBe("livePreview");
  });

  it("setMode ignores unknown modes", () => {
    const { result } = renderHook(() => useEditorModeStore());
    act(() => {
      result.current.setMode("livePreview");
    });
    expect(result.current.mode).toBe("livePreview");
  });
});

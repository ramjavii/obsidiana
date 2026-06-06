import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  useEditorModeStore,
  type EditorMode,
} from "@/hooks/useEditorModeStore";
import { EditorModeToggle } from "@/components/EditorModeToggle";

const MODES: EditorMode[] = ["source", "livePreview", "reading"];
const LABELS: Record<EditorMode, string> = {
  source: "Source",
  livePreview: "Live Preview",
  reading: "Reading view",
};

describe("EditorModeToggle", () => {
  beforeEach(() => {
    useEditorModeStore.setState({ mode: "livePreview" });
  });

  it("renders a button for each of the three modes", () => {
    render(<EditorModeToggle />);
    for (const mode of MODES) {
      const btn = screen.getByTestId(`mode-toggle-${mode}`);
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent(LABELS[mode]);
    }
  });

  it("marks the current mode with data-active=true and the others with false", () => {
    useEditorModeStore.setState({ mode: "source" });
    render(<EditorModeToggle />);
    for (const mode of MODES) {
      const btn = screen.getByTestId(`mode-toggle-${mode}`);
      if (mode === "source") {
        expect(btn.getAttribute("data-active")).toBe("true");
      } else {
        expect(btn.getAttribute("data-active")).toBe("false");
      }
    }
  });

  it("clicking the Source button calls setMode('source')", () => {
    render(<EditorModeToggle />);
    fireEvent.click(screen.getByTestId("mode-toggle-source"));
    expect(useEditorModeStore.getState().mode).toBe("source");
  });

  it("clicking the Reading view button calls setMode('reading')", () => {
    render(<EditorModeToggle />);
    fireEvent.click(screen.getByTestId("mode-toggle-reading"));
    expect(useEditorModeStore.getState().mode).toBe("reading");
  });

  it("clicking the Live Preview button after switching to source returns to livePreview", () => {
    useEditorModeStore.setState({ mode: "source" });
    render(<EditorModeToggle />);
    fireEvent.click(screen.getByTestId("mode-toggle-livePreview"));
    expect(useEditorModeStore.getState().mode).toBe("livePreview");
  });
});

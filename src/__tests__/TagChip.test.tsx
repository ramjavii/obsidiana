import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TagChip } from "@/components/TagChip";
import type { TagRef } from "@/types/markdown";

const tag = (name: string, line = 1): TagRef => ({ name, line });

describe("TagChip", () => {
  it("renders the tag name with a leading #", () => {
    render(<TagChip tag={tag("idea")} />);
    expect(screen.getByTestId("tag-chip-idea").textContent).toBe("#idea");
  });

  it("applies the data-testid matching the tag name", () => {
    render(<TagChip tag={tag("project/2-8")} />);
    expect(screen.getByTestId("tag-chip-project/2-8")).toBeInTheDocument();
  });

  it("renders as a button when onClick is provided", () => {
    const onClick = vi.fn();
    render(<TagChip tag={tag("idea")} onClick={onClick} />);
    const el = screen.getByTestId("tag-chip-idea");
    expect(el.tagName).toBe("BUTTON");
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledWith("idea");
  });

  it("renders as a span when onClick is omitted", () => {
    render(<TagChip tag={tag("idea")} />);
    const el = screen.getByTestId("tag-chip-idea");
    expect(el.tagName).toBe("SPAN");
  });
});

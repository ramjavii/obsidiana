import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TagList } from "@/components/TagList";
import type { TagRef } from "@/types/markdown";

const tag = (name: string, line = 1): TagRef => ({ name, line });

describe("TagList", () => {
  it("renders one chip per tag with a stable key", () => {
    const tags: TagRef[] = [tag("alpha", 1), tag("beta", 3)];
    render(<TagList tags={tags} />);
    expect(screen.getByTestId("tag-chip-alpha")).toBeInTheDocument();
    expect(screen.getByTestId("tag-chip-beta")).toBeInTheDocument();
  });

  it("shows the empty state when the list is empty", () => {
    render(<TagList tags={[]} />);
    expect(screen.getByTestId("tag-list-empty")).toBeInTheDocument();
    expect(screen.getByTestId("tag-list-empty").textContent).toBe("No tags");
  });

  it("uses a custom empty text when provided", () => {
    render(<TagList tags={[]} emptyText="This note has no tags yet" />);
    expect(
      screen.getByText("This note has no tags yet"),
    ).toBeInTheDocument();
  });

  it("invokes onTagClick with the tag name when a chip is clicked", () => {
    const onTagClick = vi.fn();
    const tags: TagRef[] = [tag("alpha", 1), tag("beta", 3)];
    render(<TagList tags={tags} onTagClick={onTagClick} />);
    screen.getByTestId("tag-chip-alpha").click();
    screen.getByTestId("tag-chip-beta").click();
    expect(onTagClick).toHaveBeenNthCalledWith(1, "alpha");
    expect(onTagClick).toHaveBeenNthCalledWith(2, "beta");
  });
});

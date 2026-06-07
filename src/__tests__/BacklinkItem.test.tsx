import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BacklinkItem } from "@/components/BacklinkItem";
import type { BacklinkRef } from "@/types/markdown";

const backlink: BacklinkRef = {
  sourcePath: "notes/idea.md",
  sourceTitle: "Idea",
  kind: "wikilink",
  blockId: null,
};

describe("BacklinkItem", () => {
  it("renders the title and path", () => {
    render(<BacklinkItem backlink={backlink} />);
    expect(screen.getByText("Idea")).toBeInTheDocument();
    expect(screen.getByText("notes/idea.md")).toBeInTheDocument();
  });

  it("calls onClick with sourcePath when clicked", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<BacklinkItem backlink={backlink} onClick={onClick} />);
    await user.click(screen.getByTestId("backlink-item"));
    expect(onClick).toHaveBeenCalledWith("notes/idea.md");
  });

  it("renders without onClick handler when not provided", () => {
    render(<BacklinkItem backlink={backlink} />);
    expect(screen.getByTestId("backlink-item")).toBeInTheDocument();
  });
});

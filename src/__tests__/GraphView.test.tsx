import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { GraphView } from "@/components/GraphView";
import { invokeMock } from "./setup";
import type { GraphData } from "@/types/index";

vi.mock("react-force-graph-2d", () => ({
  default: ({
    graphData,
    nodeCanvasObject,
  }: {
    graphData: GraphData;
    nodeCanvasObjectMode?: string | (() => string);
    nodeCanvasObject?: () => void;
  }) => {
    return (
      <div
        data-testid="graph-canvas"
        data-nodes={JSON.stringify(graphData.nodes)}
        data-links={JSON.stringify(graphData.links)}
        data-has-nodecanvas={String(!!nodeCanvasObject)}
      />
    );
  },
}));

function wrapperFactory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("GraphView", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(() => Promise.resolve("pong"));
  });

  it("calls graph_snapshot IPC on mount", async () => {
    const data: GraphData = { nodes: [], links: [] };
    invokeMock.mockResolvedValueOnce(data);

    render(<GraphView />, { wrapper: wrapperFactory() });

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith("graph_snapshot", undefined);
  });

  it("shows a loading indicator while data is being fetched", async () => {
    invokeMock.mockReturnValueOnce(new Promise(() => {}));

    render(<GraphView />, { wrapper: wrapperFactory() });

    expect(screen.getByTestId("graph-loading")).toBeInTheDocument();
  });

  it("shows the empty state when there are no nodes", async () => {
    const data: GraphData = { nodes: [], links: [] };
    invokeMock.mockResolvedValueOnce(data);

    render(<GraphView />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("graph-empty")).toBeInTheDocument(),
    );
  });

  it("shows the error state when the IPC rejects", async () => {
    invokeMock.mockRejectedValueOnce({
      kind: "Internal",
      data: { message: "db error" },
    });

    render(<GraphView />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("graph-error")).toBeInTheDocument(),
    );
  });

  it("renders a force graph canvas when data arrives", async () => {
    const data: GraphData = {
      nodes: [
        { id: "a.md", title: "A" },
        { id: "b.md", title: "B" },
      ],
      links: [{ source: "a.md", target: "b.md" }],
    };
    invokeMock.mockResolvedValueOnce(data);

    render(<GraphView />, { wrapper: wrapperFactory() });

    await waitFor(() =>
      expect(screen.getByTestId("graph-canvas")).toBeInTheDocument(),
    );
  });

  it("shows all nodes regardless of activePath (single main graph)", async () => {
    const data: GraphData = {
      nodes: [
        { id: "a.md", title: "A" },
        { id: "b.md", title: "B" },
        { id: "c.md", title: "C" },
      ],
      links: [
        { source: "a.md", target: "b.md" },
        { source: "b.md", target: "c.md" },
      ],
    };
    invokeMock.mockResolvedValueOnce(data);

    render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

    await waitFor(() => {
      const canvas = screen.getByTestId("graph-canvas");
      const nodes: { id: string }[] = JSON.parse(
        canvas.getAttribute("data-nodes") ?? "[]",
      );
      expect(nodes).toHaveLength(3);
    });
  });

  describe("Canvas rendering", () => {
    const bigData: GraphData = {
      nodes: [
        { id: "a.md", title: "A" },
        { id: "b.md", title: "B" },
      ],
      links: [{ source: "a.md", target: "b.md" }],
    };

    it("passes nodeCanvasObjectMode and nodeCanvasObject to ForceGraph2D", async () => {
      invokeMock.mockResolvedValueOnce(bigData);

      render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

      await waitFor(() => {
        const canvas = screen.getByTestId("graph-canvas");
        expect(canvas.getAttribute("data-has-nodecanvas")).toBe("true");
      });
    });
  });
});

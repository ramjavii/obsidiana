import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { GraphView } from "@/components/GraphView";
import { invokeMock } from "./setup";
import type { GraphData } from "@/types/index";

const mockOnZoom = vi.fn();

vi.mock("react-force-graph-2d", () => ({
  default: ({
    graphData,
    onZoom,
    nodeCanvasObject,
  }: {
    graphData: GraphData;
    onZoom?: (t: { k: number }) => void;
    nodeCanvasObjectMode?: string | (() => string);
    nodeCanvasObject?: () => void;
  }) => {
    if (onZoom) mockOnZoom.mockImplementation(onZoom);
    return (
      <div
        data-testid="graph-canvas"
        data-nodes={JSON.stringify(graphData.nodes)}
        data-has-onzoom={String(!!onZoom)}
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

  describe("N-hop filter", () => {
    const linkedData: GraphData = {
      nodes: [
        { id: "a.md", title: "A" },
        { id: "b.md", title: "B" },
        { id: "c.md", title: "C" },
        { id: "d.md", title: "D" },
      ],
      links: [
        { source: "a.md", target: "b.md" },
        { source: "b.md", target: "c.md" },
        { source: "c.md", target: "d.md" },
      ],
    };

    it("shows an unfiltered prompt when no activePath is provided", async () => {
      invokeMock.mockResolvedValueOnce(linkedData);

      render(<GraphView />, { wrapper: wrapperFactory() });

      await waitFor(() =>
        expect(screen.getByTestId("graph-filter-prompt")).toBeInTheDocument(),
      );
      expect(screen.getByTestId("graph-canvas")).toBeInTheDocument();
    });

    it("shows filter controls (hops selector + orphan toggle)", async () => {
      invokeMock.mockResolvedValueOnce(linkedData);

      render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

      await waitFor(() => {
        expect(screen.getByTestId("graph-hops-select")).toBeInTheDocument();
      });
      expect(screen.getByTestId("graph-orphan-toggle")).toBeInTheDocument();
    });

    it("filters to 1-hop neighborhood given activePath", async () => {
      invokeMock.mockResolvedValueOnce(linkedData);

      render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId("graph-hops-select")).toBeInTheDocument();
      });
      await user.selectOptions(
        screen.getByTestId("graph-hops-select"),
        "1",
      );

      await waitFor(() => {
        const canvas = screen.getByTestId("graph-canvas");
        const nodes: { id: string }[] = JSON.parse(
          canvas.getAttribute("data-nodes") ?? "[]",
        );
        expect(nodes).toHaveLength(2);
        expect(nodes.map((n) => n.id)).toEqual(["a.md", "b.md"]);
      });
    });

    it("filters to 2-hop neighborhood given activePath", async () => {
      invokeMock.mockResolvedValueOnce(linkedData);

      render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId("graph-hops-select")).toBeInTheDocument();
      });
      await user.selectOptions(
        screen.getByTestId("graph-hops-select"),
        "2",
      );

      await waitFor(() => {
        const canvas = screen.getByTestId("graph-canvas");
        const nodes: { id: string }[] = JSON.parse(
          canvas.getAttribute("data-nodes") ?? "[]",
        );
        expect(nodes).toHaveLength(3);
        expect(nodes.map((n) => n.id)).toEqual(["a.md", "b.md", "c.md"]);
      });
    });

    it("shows all nodes when hops is set to 0 (unlimited)", async () => {
      invokeMock.mockResolvedValueOnce(linkedData);

      render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId("graph-hops-select")).toBeInTheDocument();
      });
      await user.selectOptions(
        screen.getByTestId("graph-hops-select"),
        "0",
      );

      await waitFor(() => {
        const canvas = screen.getByTestId("graph-canvas");
        const nodes: { id: string }[] = JSON.parse(
          canvas.getAttribute("data-nodes") ?? "[]",
        );
        expect(nodes).toHaveLength(4);
      });
    });

    it("hides orphan nodes (no connections) when orphan toggle is on", async () => {
      const dataWithOrphan: GraphData = {
        nodes: [
          { id: "a.md", title: "A" },
          { id: "b.md", title: "B" },
          { id: "orphan.md", title: "Orphan" },
        ],
        links: [{ source: "a.md", target: "b.md" }],
      };
      invokeMock.mockResolvedValueOnce(dataWithOrphan);

      render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

      await waitFor(() => {
        const canvas = screen.getByTestId("graph-canvas");
        const nodes: { id: string }[] = JSON.parse(
          canvas.getAttribute("data-nodes") ?? "[]",
        );
        const ids = nodes.map((n) => n.id);
        expect(ids).not.toContain("orphan.md");
      });
    });

    it("shows orphan nodes when orphan toggle is off", async () => {
      const dataWithOrphan: GraphData = {
        nodes: [
          { id: "a.md", title: "A" },
          { id: "b.md", title: "B" },
          { id: "orphan.md", title: "Orphan" },
        ],
        links: [{ source: "a.md", target: "b.md" }],
      };
      invokeMock.mockResolvedValueOnce(dataWithOrphan);

      render(<GraphView activePath="a.md" />, { wrapper: wrapperFactory() });

      const user = userEvent.setup();

      await waitFor(() => {
        expect(screen.getByTestId("graph-orphan-toggle")).toBeInTheDocument();
      });
      await user.click(screen.getByTestId("graph-orphan-toggle"));

      await waitFor(() => {
        const canvas = screen.getByTestId("graph-canvas");
        const nodes: { id: string }[] = JSON.parse(
          canvas.getAttribute("data-nodes") ?? "[]",
        );
        const ids = nodes.map((n) => n.id);
        expect(ids).toContain("orphan.md");
      });
    });
  });

  describe("Zoom fade", () => {
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

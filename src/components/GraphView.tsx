import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { getGraphSnapshot } from "@/ipc/graph";
import { appErrorMessage } from "@/errors";
import type { AppError } from "@/errors";
import type { GraphData, GraphLink, GraphNode } from "@/types/index";

function getLinkEndpoints(link: GraphLink): [string, string] {
  return [
    typeof link.source === "string" ? link.source : (link.source as { id: string }).id,
    typeof link.target === "string" ? link.target : (link.target as { id: string }).id,
  ];
}

function computeHighlightSet(
  links: GraphLink[],
  activePath: string | undefined,
): Set<string> | null {
  if (!activePath) return null;
  const connected = new Set<string>([activePath]);
  for (const link of links) {
    const [srcId, tgtId] = getLinkEndpoints(link);
    if (srcId === activePath) connected.add(tgtId);
    if (tgtId === activePath) connected.add(srcId);
  }
  return connected;
}

function computeChildrenSet(
  links: GraphLink[],
  activePath: string | undefined,
): Set<string> | null {
  if (!activePath) return null;
  const children = new Set<string>();
  for (const link of links) {
    const [srcId, tgtId] = getLinkEndpoints(link);
    if (srcId === activePath) children.add(tgtId);
  }
  return children.size > 0 ? children : null;
}

function isHighlightedLink(
  link: GraphLink,
  highlightSet: Set<string> | null,
): boolean {
  if (!highlightSet) return false;
  const [srcId, tgtId] = getLinkEndpoints(link);
  return highlightSet.has(srcId) && highlightSet.has(tgtId);
}

const zoomControlBtn =
  "flex items-center justify-center h-6 w-6 rounded bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 text-xs border border-zinc-700/50";

type Props = {
  activePath?: string;
  onNodeClick?: (path: string) => void;
};

export function GraphView({ activePath, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined);
  const [graphSize, setGraphSize] = useState({ width: 256, height: 400 });
  const hoveredNodeId = useRef<string | null>(null);

  const measuredRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setGraphSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (fgRef.current && graphSize.width > 0 && graphSize.height > 0) {
      fgRef.current.d3ReheatSimulation();
    }
  }, [graphSize]);

  const query = useQuery<GraphData, AppError>({
    queryKey: ["graph"],
    queryFn: getGraphSnapshot,
  });

  const highlightSet = useMemo(
    () => (query.data ? computeHighlightSet(query.data.links, activePath) : null),
    [query.data, activePath],
  );

  const childrenSet = useMemo(
    () => (query.data ? computeChildrenSet(query.data.links, activePath) : null),
    [query.data, activePath],
  );

  useEffect(() => {
    if (!activePath || !fgRef.current || !query.data) return;
    const found = query.data.nodes.find((n) => n.id === activePath);
    if (found) {
      fgRef.current.centerAt(
        (found as { x?: number; y?: number }).x,
        (found as { x?: number; y?: number }).y,
        400,
      );
    }
  }, [activePath, query.data]);

  const handleNodeClick = useCallback(
    (node: { id: string }) => onNodeClick?.(node.id),
    [onNodeClick],
  );

  const handleNodeHover = useCallback((node: { id: string } | null) => {
    hoveredNodeId.current = node?.id ?? null;
  }, []);

  const handleFitView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400);
    }
  }, []);

  const nodeCanvasObject = useCallback(
    (node: { x?: number; y?: number; id: string; title?: string }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const label = n.title ?? n.id ?? "";
      const r = n.id === activePath
        ? Math.sqrt(6 / 6) * 6
        : Math.sqrt(1.5 / 6) * 6;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const isHovered = n.id === hoveredNodeId.current;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = n.id === activePath
        ? "#10b981"
        : childrenSet?.has(n.id)
          ? "#fbbf24"
          : isHovered
            ? "#71717a"
            : "#52525b";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();

      if (n.id === activePath) {
        ctx.beginPath();
        ctx.arc(x, y, r + 8 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
        ctx.lineWidth = 3 / globalScale;
        ctx.stroke();
      } else if (childrenSet?.has(n.id)) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(251, 191, 36, 0.45)";
        ctx.lineWidth = 2.5 / globalScale;
        ctx.stroke();
      }

      if (isHovered && n.id !== activePath && !childrenSet?.has(n.id)) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      const fontSize = Math.max(8, 11 / globalScale);
      ctx.font = `${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const labelY = y + r + 4 / globalScale;
      const metrics = ctx.measureText(label);
      const pad = 3 / globalScale;
      const bw = metrics.width + pad * 2;
      const bh = fontSize + pad * 2;

      ctx.fillStyle = "rgba(9, 9, 11, 0.75)";
      if (ctx.roundRect) {
        const rad = 3 / globalScale;
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, labelY - pad, bw, bh, rad);
        ctx.fill();
      } else {
        ctx.fillRect(x - bw / 2, labelY - pad, bw, bh);
      }

      ctx.fillStyle = "rgba(212, 212, 216, 0.95)";
      ctx.textBaseline = "top";
      ctx.fillText(label, x, labelY);
    },
    [activePath, childrenSet],
  );

  return (
    <div className="flex h-full flex-col relative">
      <div
        ref={measuredRef}
        className="flex-1 min-h-0"
      >
        {query.isPending ? (
          <div
            data-testid="graph-loading"
            className="flex h-full items-center justify-center text-xs text-zinc-500"
          >
            Loading graph…
          </div>
        ) : query.isError ? (
          <div
            data-testid="graph-error"
            className="p-3 text-xs text-rose-400"
          >
            {appErrorMessage(query.error)}
          </div>
        ) : !query.data || query.data.nodes.length === 0 ? (
          <div
            data-testid="graph-empty"
            className="flex h-full items-center justify-center text-xs text-zinc-500"
          >
            No notes yet
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            graphData={query.data}
            nodeLabel="title"
            nodeRelSize={6}
            nodeVal={(node) =>
              (node as GraphNode).id === activePath ? 6 : 1.5
            }
            nodeColor={(node) => {
              const id = (node as GraphNode).id;
              if (id === activePath) return "#10b981";
              if (childrenSet?.has(id)) return "#fbbf24";
              return "#52525b";
            }}
            linkColor={(link) =>
              isHighlightedLink(link as GraphLink, highlightSet)
                ? "#a1a1aa"
                : "#3f3f46"
            }
            linkWidth={(link) =>
              isHighlightedLink(link as GraphLink, highlightSet) ? 4 : 1.5
            }
            linkCurvature={0.25}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalParticleWidth={5}
            linkDirectionalParticleColor={(link) =>
              isHighlightedLink(link as GraphLink, highlightSet)
                ? "#10b981"
                : "#d4d4d8"
            }
            backgroundColor="#09090b"
            width={graphSize.width}
            height={graphSize.height}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            d3AlphaDecay={0.08}
            d3VelocityDecay={0.6}
            warmupTicks={200}
            cooldownTicks={500}
            cooldownTime={5000}
            nodeCanvasObjectMode={() => "replace"}
            nodeCanvasObject={nodeCanvasObject}
          />
        )}
      </div>
      {query.data && query.data.nodes.length > 0 && (
        <div className="absolute bottom-2 right-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={handleFitView}
            className={zoomControlBtn}
            title="Fit view"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

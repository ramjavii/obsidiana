import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ForceGraph2D from "react-force-graph-2d";
import { getGraphSnapshot } from "@/ipc/graph";
import { appErrorMessage } from "@/errors";
import type { AppError } from "@/errors";
import type { GraphData, GraphLink, GraphNode } from "@/types/index";

function getLinkEndpoints(link: GraphLink): [string, string] {
  return [link.source, link.target];
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

function isHighlightedLink(
  link: GraphLink,
  highlightSet: Set<string> | null,
): boolean {
  if (!highlightSet) return false;
  const [srcId, tgtId] = getLinkEndpoints(link);
  return highlightSet.has(srcId) && highlightSet.has(tgtId);
}

type Props = {
  activePath?: string;
  onNodeClick?: (path: string) => void;
};

export function GraphView({ activePath, onNodeClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 256, height: 400 });
  const measuredRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setGraphSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const query = useQuery<GraphData, AppError>({
    queryKey: ["graph"],
    queryFn: getGraphSnapshot,
  });

  const highlightSet = useMemo(
    () => (query.data ? computeHighlightSet(query.data.links, activePath) : null),
    [query.data, activePath],
  );

  if (query.isPending) {
    return (
      <div
        data-testid="graph-loading"
        className="flex h-full items-center justify-center text-xs text-zinc-500"
      >
        Loading graph…
      </div>
    );
  }

  if (query.isError) {
    return (
      <div
        data-testid="graph-error"
        className="p-3 text-xs text-rose-400"
      >
        {appErrorMessage(query.error)}
      </div>
    );
  }

  if (!query.data || query.data.nodes.length === 0) {
    return (
      <div
        data-testid="graph-empty"
        className="flex h-full items-center justify-center text-xs text-zinc-500"
      >
        No notes yet
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        ref={measuredRef}
        className="flex-1 min-h-0"
        style={{
          background: "radial-gradient(ellipse at center, #09090b 0%, #000000 100%)",
        }}
      >
        <ForceGraph2D
          graphData={query.data}
          nodeLabel="title"
          nodeRelSize={6}
          nodeVal={(node) =>
            (node as GraphNode).id === activePath ? 6 : 1.5
          }
          nodeColor={(node) => {
            const id = (node as GraphNode).id;
            if (id === activePath) return "#10b981";
            if (highlightSet?.has(id)) return "#fbbf24";
            return "#52525b";
          }}
          linkColor={(link) =>
            isHighlightedLink(link as GraphLink, highlightSet)
              ? "#a1a1aa"
              : "#3f3f46"
          }
          linkWidth={(link) =>
            isHighlightedLink(link as GraphLink, highlightSet) ? 3 : 1.2
          }
          linkCurvature={0.25}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={1}
          linkDirectionalParticleColor={(link) =>
            isHighlightedLink(link as GraphLink, highlightSet)
              ? "#a1a1aa"
              : "#3f3f46"
          }
          backgroundColor="#09090b"
          width={graphSize.width}
          height={graphSize.height}
          onNodeClick={(node) => onNodeClick?.((node as { id: string }).id)}
          d3AlphaDecay={0.08}
          d3VelocityDecay={0.6}
          warmupTicks={200}
          cooldownTicks={500}
          cooldownTime={5000}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode;
            const label = n.title ?? n.id ?? "";
            const r = n.id === activePath
              ? Math.sqrt(6 / 6) * 6
              : Math.sqrt(1.5 / 6) * 6;
            const x = node.x ?? 0;
            const y = node.y ?? 0;

            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = n.id === activePath ? "#10b981" : highlightSet?.has(n.id) ? "#fbbf24" : "#52525b";
            ctx.fill();
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();

            if (n.id === activePath) {
              ctx.beginPath();
              ctx.arc(x, y, r + 6 / globalScale, 0, 2 * Math.PI);
              ctx.strokeStyle = "rgba(16, 185, 129, 0.35)";
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
            ctx.roundRect
              ? (() => {
                  const rad = 3 / globalScale;
                  ctx.beginPath();
                  ctx.roundRect(x - bw / 2, labelY - pad, bw, bh, rad);
                  ctx.fill();
                })()
              : ctx.fillRect(x - bw / 2, labelY - pad, bw, bh);

            ctx.fillStyle = "rgba(212, 212, 216, 0.95)";
            ctx.textBaseline = "top";
            ctx.fillText(label, x, labelY);
          }}
        />
      </div>
    </div>
  );
}

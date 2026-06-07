import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ForceGraph2D from "react-force-graph-2d";
import { getGraphSnapshot } from "@/ipc/graph";
import { appErrorMessage } from "@/errors";
import type { AppError } from "@/errors";
import type { GraphData, GraphLink, GraphNode } from "@/types/index";

function computeDegree(links: GraphLink[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const link of links) {
    const srcId = link.source;
    const tgtId = link.target;
    degree.set(srcId, (degree.get(srcId) ?? 0) + 1);
    degree.set(tgtId, (degree.get(tgtId) ?? 0) + 1);
  }
  return degree;
}

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

  const degreeMap = useMemo(
    () => (query.data ? computeDegree(query.data.links) : new Map<string, number>()),
    [query.data],
  );

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
      <div ref={measuredRef} className="flex-1 min-h-0">
        <ForceGraph2D
          graphData={query.data}
          nodeLabel="title"
          nodeRelSize={6}
          nodeVal={(node) => {
            const deg = degreeMap.get((node as GraphNode).id) ?? 0;
            return 1 + deg * 2;
          }}
          nodeColor={(node) => {
            const id = (node as GraphNode).id;
            if (id === activePath) return "#10b981";
            if (highlightSet?.has(id)) return "#a1a1aa";
            return "#52525b";
          }}
          linkColor={(link) =>
            isHighlightedLink(link as GraphLink, highlightSet)
              ? "#a1a1aa"
              : "#3f3f46"
          }
          linkWidth={(link) =>
            isHighlightedLink(link as GraphLink, highlightSet) ? 2 : 0.3
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
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode;
            const label = n.title ?? n.id ?? "";
            const deg = degreeMap.get(n.id) ?? 0;
            const r = Math.sqrt((1 + deg * 2) / 6) * 6;
            const fontSize = Math.max(8, 11 / globalScale);
            ctx.font = `${fontSize}px system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillStyle = `rgba(212, 212, 216, ${Math.min(1, (globalScale - 0.2) / 0.5).toFixed(2)})`;
            ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + r + 4 / globalScale);
          }}
        />
      </div>
    </div>
  );
}

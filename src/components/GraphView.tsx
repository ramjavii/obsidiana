import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ForceGraph2D from "react-force-graph-2d";
import { getGraphSnapshot } from "@/ipc/graph";
import { appErrorMessage } from "@/errors";
import type { AppError } from "@/errors";
import type { GraphData, GraphLink, GraphNode } from "@/types/index";

function getLinkEndpoints(
  link: GraphLink,
): [string, string] {
  const srcId = link.source;
  const tgtId = link.target;
  return [srcId, tgtId];
}

function computeNhopNeighborhood(
  nodes: GraphNode[],
  links: GraphLink[],
  activePath: string,
  maxHops: number,
  hideOrphans: boolean,
): GraphData {
  const linkMap = new Map<string, GraphLink[]>();
  const orphanCandidate = new Set(nodes.map((n) => n.id));

  for (const link of links) {
    const [srcId, tgtId] = getLinkEndpoints(link);

    if (!linkMap.has(srcId)) linkMap.set(srcId, []);
    linkMap.get(srcId)!.push(link);
    if (!linkMap.has(tgtId)) linkMap.set(tgtId, []);
    linkMap.get(tgtId)!.push(link);

    orphanCandidate.delete(srcId);
    orphanCandidate.delete(tgtId);
  }

  const visited = new Set<string>([activePath]);
  let frontier = [activePath];

  if (maxHops > 0) {
    for (let hop = 1; hop <= maxHops; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        const adjacent = linkMap.get(id) ?? [];
        for (const link of adjacent) {
          const [srcId, tgtId] = getLinkEndpoints(link);
          const neighbor = srcId === id ? tgtId : srcId;
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
    }
  } else {
    for (const n of nodes) visited.add(n.id);
  }

  let filteredNodes: GraphNode[];

  if (hideOrphans) {
    filteredNodes = nodes.filter((n) => visited.has(n.id));
    const connected = new Set<string>();
    for (const link of links) {
      const [srcId, tgtId] = getLinkEndpoints(link);
      if (visited.has(srcId) && visited.has(tgtId)) {
        connected.add(srcId);
        connected.add(tgtId);
      }
    }
    filteredNodes = filteredNodes.filter((n) => connected.has(n.id) || n.id === activePath);
  } else {
    filteredNodes = nodes.filter((n) => visited.has(n.id) || orphanCandidate.has(n.id));
  }

  const visitedSet = new Set(filteredNodes.map((n) => n.id));
  const filteredLinks = links.filter((link) => {
    const [srcId, tgtId] = getLinkEndpoints(link);
    return visitedSet.has(srcId) && visitedSet.has(tgtId);
  });

  return { nodes: filteredNodes, links: filteredLinks };
}

function computeDegree(links: GraphLink[]): Map<string, number> {
  const degree = new Map<string, number>();
  for (const link of links) {
    const [srcId, tgtId] = getLinkEndpoints(link);
    degree.set(srcId, (degree.get(srcId) ?? 0) + 1);
    degree.set(tgtId, (degree.get(tgtId) ?? 0) + 1);
  }
  return degree;
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

  const filtered = useMemo(() => {
    const data = query.data;
    if (!data || data.nodes.length === 0) return data;

    if (!activePath) return data;

    try {
      return computeNhopNeighborhood(
        data.nodes,
        data.links,
        activePath,
        2,
        true,
      );
    } catch {
      return data;
    }
  }, [query.data, activePath]);

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
          graphData={filtered ?? { nodes: [], links: [] }}
          nodeLabel="title"
          nodeRelSize={6}
          nodeVal={(node) => {
            const deg = degreeMap.get((node as GraphNode).id) ?? 0;
            return 1 + deg * 2;
          }}
          nodeColor={(node) => (node as GraphNode).id === activePath ? "#10b981" : "#52525b"}
          linkColor={() => "#3f3f46"}
          linkWidth={0.5}
          backgroundColor="#09090b"
          width={graphSize.width}
          height={graphSize.height}
          onNodeClick={(node) => onNodeClick?.((node as { id: string }).id)}
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

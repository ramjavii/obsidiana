import { useMemo, useState } from "react";
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

type Props = {
  activePath?: string;
  onNodeClick?: (path: string) => void;
};

export function GraphView({ activePath, onNodeClick }: Props) {
  const [maxHops, setMaxHops] = useState(2);
  const [hideOrphans, setHideOrphans] = useState(true);

  const query = useQuery<GraphData, AppError>({
    queryKey: ["graph"],
    queryFn: getGraphSnapshot,
  });

  const filtered = useMemo(() => {
    const data = query.data;
    if (!data || data.nodes.length === 0) return data;

    if (!activePath) return data;

    try {
      return computeNhopNeighborhood(
        data.nodes,
        data.links,
        activePath,
        maxHops,
        hideOrphans,
      );
    } catch {
      return data;
    }
  }, [query.data, activePath, maxHops, hideOrphans]);

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
      {activePath ? (
        <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-1.5 text-xs">
          <label className="flex items-center gap-1 text-zinc-400">
            Hops:
            <select
              data-testid="graph-hops-select"
              value={maxHops}
              onChange={(e) => setMaxHops(Number(e.target.value))}
              className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-200"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={0}>∞</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-zinc-400">
            <input
              type="checkbox"
              data-testid="graph-orphan-toggle"
              checked={hideOrphans}
              onChange={(e) => setHideOrphans(e.target.checked)}
              className="accent-emerald-500"
            />
            Hide orphans
          </label>
        </div>
      ) : (
        <div
          data-testid="graph-filter-prompt"
          className="border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-500"
        >
          Select a note from the tree to filter the graph.
        </div>
      )}
      <div className="flex-1">
        <ForceGraph2D
          graphData={filtered ?? { nodes: [], links: [] }}
          nodeLabel="title"
          nodeColor={() => "#10b981"}
          linkColor={() => "#52525b"}
          backgroundColor="#09090b"
          width={256}
          height={400}
          onNodeClick={(node) => onNodeClick?.((node as { id: string }).id)}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.title ?? node.id ?? "";
            const fontSize = 10 / globalScale;
            const opacity = Math.min(1, Math.max(0, (globalScale - 0.3) / 0.7));
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            ctx.fillStyle = `rgba(161, 161, 170, ${opacity.toFixed(2)})`;
            ctx.fillText(label, node.x ?? 0, (node.y ?? 0) + 2 / globalScale);
          }}
        />
      </div>
    </div>
  );
}

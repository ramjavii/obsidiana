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

const COLORS = {
  bg: "#09090b",
  brand: "#2563eb",
  brandLight: "#3b82f6",
  brandDim: "#1d4ed8",
  active: "#22c55e",
  activeGlow: "rgba(34, 197, 94, 0.25)",
  child: "#eab308",
  childGlow: "rgba(234, 179, 8, 0.2)",
  empty: "#27272a",
  emptyStroke: "rgba(255, 255, 255, 0.06)",
  default: "#3f3f46",
  defaultStroke: "rgba(255, 255, 255, 0.12)",
  hovered: "#52525b",
  labelBg: "rgba(9, 9, 11, 0.75)",
  labelText: "rgba(212, 212, 216, 0.9)",
  labelTextEmpty: "rgba(113, 113, 122, 0.6)",
  link: "rgba(63, 63, 70, 0.8)",
  linkHighlight: "rgba(37, 99, 235, 0.6)",
  linkParticle: "#3b82f6",
};

const ctrlBtn =
  "flex items-center justify-center h-7 w-7 rounded-md bg-zinc-900/90 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-800/80 transition-colors duration-150";

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
  const isDragging = useRef(false);

  const query = useQuery<GraphData, AppError>({
    queryKey: ["graph"],
    queryFn: getGraphSnapshot,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev,
  });

  const zoomedRef = useRef(false);

  const measuredRef = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        setGraphSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
      }
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !query.data || query.data.nodes.length === 0 || zoomedRef.current) return;
    const timer = setTimeout(() => {
      fg.zoomToFit(400, 40);
      zoomedRef.current = true;
    }, 800);
    return () => clearTimeout(timer);
  }, [query.data]);

  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  const childrenSetRef = useRef(childrenSet);
  childrenSetRef.current = childrenSet;

  const highlightSetRef = useRef(highlightSet);
  highlightSetRef.current = highlightSet;

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const sim = fg as unknown as {
      d3Force: (name: string) => {
        strength?: (v: number) => void;
        distance?: (v: number) => void;
      } | undefined;
    };
    const charge = sim.d3Force("charge");
    if (charge?.strength) charge.strength(-12);
    const link = sim.d3Force("link");
    if (link) {
      if (link.distance) link.distance(50);
    }
    const center = sim.d3Force("center");
    if (center?.strength) center.strength(0.05);
  }, [query.data]);

  const handleNodeClick = useCallback(
    (node: { id: string }) => {
      if (isDragging.current) return;
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const handleNodeHover = useCallback((node: { id: string } | null) => {
    hoveredNodeId.current = node?.id ?? null;
    document.body.style.cursor = node ? "pointer" : "";
  }, []);

  const handleNodeDrag = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleNodeDragEnd = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleFitView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 40);
    }
  }, []);

  const handleZoomIn = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const curZoom = (fg as unknown as { zoom: () => number }).zoom;
    if (typeof curZoom === "function") {
      (fg as unknown as { zoom: (v: number, ms: number) => void }).zoom(curZoom() * 1.3, 200);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const curZoom = (fg as unknown as { zoom: () => number }).zoom;
    if (typeof curZoom === "function") {
      (fg as unknown as { zoom: (v: number, ms: number) => void }).zoom(curZoom() / 1.3, 200);
    }
  }, []);

  const drawNode = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      r: number,
      isEmpty: boolean,
      active: boolean,
      child: boolean,
      hovered: boolean,
      globalScale: number,
    ) => {
      const lineWidth = 1.2 / globalScale;

      if (active) {
        ctx.beginPath();
        ctx.arc(x, y, r + 10 / globalScale, 0, 2 * Math.PI);
        ctx.fillStyle = COLORS.activeGlow;
        ctx.fill();
      } else if (child) {
        ctx.beginPath();
        ctx.arc(x, y, r + 7 / globalScale, 0, 2 * Math.PI);
        ctx.fillStyle = COLORS.childGlow;
        ctx.fill();
      }

      ctx.beginPath();
      if (isEmpty) {
        const s = r * 0.8;
        ctx.moveTo(x, y - s);
        ctx.lineTo(x + s * 0.75, y);
        ctx.lineTo(x, y + s);
        ctx.lineTo(x - s * 0.75, y);
        ctx.closePath();
      } else {
        ctx.arc(x, y, r, 0, 2 * Math.PI);
      }

      ctx.fillStyle = active
        ? COLORS.active
        : child
          ? COLORS.child
          : isEmpty
            ? COLORS.empty
            : hovered
              ? COLORS.hovered
              : COLORS.default;
      ctx.fill();

      ctx.strokeStyle = isEmpty
        ? COLORS.emptyStroke
        : hovered
          ? "rgba(255, 255, 255, 0.25)"
          : COLORS.defaultStroke;
      ctx.lineWidth = hovered ? 1.8 / globalScale : lineWidth;
      ctx.stroke();

      if (active) {
        ctx.beginPath();
        ctx.arc(x, y, r + 5 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = COLORS.active;
        ctx.lineWidth = 2.2 / globalScale;
        ctx.stroke();
      } else if (child) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = COLORS.child;
        ctx.lineWidth = 1.8 / globalScale;
        ctx.stroke();
      }
    },
    [],
  );

  const nodeCanvasObject = useCallback(
    (node: { x?: number; y?: number; id: string; title?: string }, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as GraphNode;
      const label = n.title ?? n.id ?? "";
      const isEmpty = n.isEmpty ?? false;
      const curActive = activePathRef.current;
      const curChildren = childrenSetRef.current;
      const isActive = n.id === curActive;
      const isChild = curChildren?.has(n.id) ?? false;
      const isHovered = n.id === hoveredNodeId.current;

      const r = isActive
        ? 5
        : isEmpty
          ? 3
          : isChild
            ? 3.5
            : 3;
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      drawNode(ctx, x, y, r, isEmpty, isActive, isChild, isHovered, globalScale);

      const fontSize = Math.max(5 / globalScale, 2.5);
      ctx.font = `500 ${fontSize}px "Fira Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const labelY = y + r + 4 / globalScale;
      const metrics = ctx.measureText(label);
      const padX = 4 / globalScale;
      const padY = 2 / globalScale;
      const bw = metrics.width + padX * 2;
      const bh = fontSize + padY * 2;

      ctx.fillStyle = COLORS.labelBg;
      if (ctx.roundRect) {
        const rad = 4 / globalScale;
        ctx.beginPath();
        ctx.roundRect(x - bw / 2, labelY - padY, bw, bh, rad);
        ctx.fill();
      } else {
        ctx.fillRect(x - bw / 2, labelY - padY, bw, bh);
      }

      ctx.fillStyle = isEmpty ? COLORS.labelTextEmpty : COLORS.labelText;
      ctx.textBaseline = "top";
      ctx.fillText(label, x, labelY);
    },
    [drawNode],
  );

  const nodeVal = useCallback(
    (node: GraphNode) => {
      if (node.id === activePathRef.current) return 4;
      if (childrenSetRef.current?.has(node.id)) return 2;
      return 1;
    },
    [],
  );

  const nodeColor = useCallback(
    (node: GraphNode) => {
      const id = node.id;
      if (id === activePathRef.current) return COLORS.active;
      if (childrenSetRef.current?.has(id)) return COLORS.child;
      if ((node as GraphNode).isEmpty) return COLORS.empty;
      return COLORS.default;
    },
    [],
  );

  const linkColor = useCallback(
    (link: GraphLink) =>
      isHighlightedLink(link, highlightSetRef.current) ? COLORS.linkHighlight : COLORS.link,
    [],
  );

  const linkWidth = useCallback(
    (link: GraphLink) => (isHighlightedLink(link, highlightSetRef.current) ? 1.5 : 0.6),
    [],
  );

  const linkDirectionalParticleColor = useCallback(
    () => COLORS.linkParticle,
    [],
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
            nodeRelSize={3}
            nodeVal={nodeVal}
            nodeColor={nodeColor}
            linkColor={linkColor}
            linkWidth={linkWidth}
            linkCurvature={0.2}
            linkDirectionalParticles={(link) =>
              isHighlightedLink(link, highlightSetRef.current) ? 2 : 0
            }
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={linkDirectionalParticleColor}
            backgroundColor={COLORS.bg}
            width={graphSize.width}
            height={graphSize.height}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onNodeDrag={handleNodeDrag}
            onNodeDragEnd={handleNodeDragEnd}
            d3AlphaDecay={0.12}
            d3VelocityDecay={0.5}
            warmupTicks={150}
            cooldownTicks={120}
            cooldownTime={2000}
            nodeCanvasObjectMode={() => "replace"}
            nodeCanvasObject={nodeCanvasObject}
          />
        )}
      </div>
      {query.data && query.data.nodes.length > 0 && (
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handleZoomIn}
            className={ctrlBtn}
            title="Zoom in"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className={ctrlBtn}
            title="Zoom out"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M5 12h14" />
            </svg>
          </button>
          <div className="h-px bg-zinc-800 my-0.5" />
          <button
            type="button"
            onClick={handleFitView}
            className={ctrlBtn}
            title="Fit view"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import ForceGraph2D from "react-force-graph-2d";
import { getGraphSnapshot } from "@/ipc/graph";
import { appErrorMessage } from "@/errors";
import type { AppError } from "@/errors";
import type { GraphData } from "@/types/index";

export function GraphView() {
  const query = useQuery<GraphData, AppError>({
    queryKey: ["graph"],
    queryFn: getGraphSnapshot,
  });

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

  const data = query.data;

  if (!data || data.nodes.length === 0) {
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
    <div className="h-full w-full">
      <ForceGraph2D
        graphData={data}
        nodeLabel="title"
        nodeColor={() => "#10b981"}
        linkColor={() => "#52525b"}
        backgroundColor="#09090b"
        width={256}
        height={400}
      />
    </div>
  );
}

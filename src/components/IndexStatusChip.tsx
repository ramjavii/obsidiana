import {
  useIndexStatus,
  useRebuildIndexMutation,
} from "@/hooks/useIndexStatus";
import { isBroken, isFailed } from "@/types/index";
import type { IndexStatus } from "@/types/index";
import { appErrorMessage } from "@/errors";

function classFor(state: IndexStatus["state"]): string {
  switch (state) {
    case "missing":
      return "bg-zinc-800 text-zinc-400";
    case "indexing":
      return "bg-zinc-800 text-zinc-200 animate-pulse";
    case "ready":
      return "bg-emerald-900 text-emerald-200";
    case "broken":
      return "bg-amber-900 text-amber-100 cursor-pointer hover:bg-amber-800";
    case "failed":
      return "bg-red-900 text-red-100 cursor-pointer hover:bg-red-800";
  }
}

function labelFor(status: IndexStatus): string {
  switch (status.state) {
    case "missing":
      return "Index idle";
    case "indexing":
      return "Indexing…";
    case "ready":
      return `Indexed · ${status.documentCount}`;
    case "broken":
      return "Index corrupt — click to rebuild";
    case "failed":
      return "Index failed — click to rebuild";
  }
}

function tooltipFor(status: IndexStatus): string | undefined {
  if (status.state === "ready") {
    return `schemaVer ${status.schemaVer}, last rebuilt ${status.lastRebuiltAt ?? "never"}`;
  }
  if (isBroken(status)) {
    return `Quarantined to ${status.quarantinedTo}`;
  }
  if (isFailed(status)) {
    return status.message;
  }
  return undefined;
}

export function IndexStatusChip() {
  const { data, isPending, isError, error } = useIndexStatus();
  const rebuild = useRebuildIndexMutation();

  if (isPending) {
    return (
      <span
        data-testid="index-status-chip"
        data-index-state="loading"
        className="rounded px-2 py-0.5 text-xs bg-zinc-800 text-zinc-500"
      >
        Index…
      </span>
    );
  }

  if (isError || !data) {
    return (
      <span
        data-testid="index-status-chip"
        data-index-state="error"
        className="rounded px-2 py-0.5 text-xs bg-zinc-800 text-rose-300"
        title={error ? appErrorMessage(error) : "index status unavailable"}
      >
        Index unknown
      </span>
    );
  }

  const cls = classFor(data.state);
  const label = labelFor(data);
  const tip = tooltipFor(data);
  const interactive = data.state === "broken" || data.state === "failed";

  if (interactive) {
    return (
      <button
        type="button"
        data-testid="index-status-chip"
        data-index-state={data.state}
        onClick={() => {
          rebuild.mutate();
        }}
        disabled={rebuild.isPending}
        className={`rounded px-2 py-0.5 text-xs ${cls}`}
        title={tip}
      >
        {rebuild.isPending ? "Rebuilding…" : label}
      </button>
    );
  }

  return (
    <span
      data-testid="index-status-chip"
      data-index-state={data.state}
      className={`rounded px-2 py-0.5 text-xs ${cls}`}
      title={tip}
    >
      {label}
    </span>
  );
}

import {
  useIndexStatus,
  useRebuildIndexMutation,
} from "@/hooks/useIndexStatus";
import type { IndexStatus } from "@/types/index";
import { appErrorMessage } from "@/errors";

function classFor(state: IndexStatus["state"]): string {
  switch (state) {
    case "missing":
      return "bg-zinc-800/60 text-zinc-500";
    case "indexing":
      return "bg-brand/10 text-brand animate-pulse";
    case "ready":
      return "bg-emerald-500/10 text-emerald-400";
    case "broken":
      return "bg-amber-500/10 text-amber-300";
    case "failed":
      return "bg-rose-500/10 text-rose-400";
  }
}

function labelFor(status: IndexStatus): string {
  switch (status.state) {
    case "missing":
      return "Index idle";
    case "indexing": {
      const indexed = status.indexed ?? 0;
      const total = status.total ?? 0;
      if (status.indexed === undefined || status.total === undefined) {
        return "Indexing…";
      }
      return `Indexing ${indexed}/${total}`;
    }
    case "ready":
      return "";
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
  if (status.state === "broken") {
    return `Quarantined to ${status.quarantinedTo}`;
  }
  if (status.state === "failed") {
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
        className="rounded px-2 py-0.5 text-xs bg-zinc-800/60 text-zinc-500"
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
        className="rounded px-2 py-0.5 text-xs bg-rose-500/10 text-rose-400"
        title={error ? appErrorMessage(error) : "index status unavailable"}
      >
        Index unknown
      </span>
    );
  }

  if (data.state === "ready") return null;

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

import { useState } from "react";
import { usePickVaultMutation } from "@/hooks/useVault";

export function EmptyState() {
  const pick = usePickVaultMutation();
  const [lastError, setLastError] = useState<string | null>(null);

  return (
    <div
      data-testid="empty-state"
      className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-100"
    >
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <h1 aria-label="OBSIDIANA" className="font-mono text-4xl font-bold tracking-tight">
          <span className="text-brand">O</span>BSIDIANA
        </h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Your local-first knowledge workspace.
          <br />
          Pick a folder to use as your vault. Your notes stay on disk.
        </p>
        <button
          type="button"
          data-testid="open-vault-button"
          onClick={() => {
            setLastError(null);
            pick.mutate(undefined, {
              onError: (err) => {
                if (err && typeof err === "object" && "data" in err) {
                  const data = (err as { data: { message?: string; what?: string } }).data;
                  setLastError(data.message ?? data.what ?? "Could not open vault");
                }
              },
            });
          }}
          disabled={pick.isPending}
          className="rounded-md border border-brand/30 bg-brand/10 px-5 py-2.5 font-mono text-sm text-brand transition-colors duration-150 hover:bg-brand/20 disabled:opacity-50"
        >
          {pick.isPending ? "Opening\u2026" : "Open vault\u2026"}
        </button>
        {lastError !== null && (
          <p data-testid="empty-state-error" className="text-sm text-rose-400">
            {lastError}
          </p>
        )}
      </div>
    </div>
  );
}

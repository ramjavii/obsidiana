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
        <h1 className="text-3xl font-semibold tracking-tight">OBSIDIANA</h1>
        <p className="text-zinc-400">
          Pick a folder to use as your vault. Your notes stay on disk; only an
          index and a settings file live in the app data directory.
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
          className="rounded border border-emerald-700 bg-emerald-900/40 px-4 py-2 text-emerald-50 hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {pick.isPending ? "Opening…" : "Open vault…"}
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

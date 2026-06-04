import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ipcInvoke } from "@/ipc";
import { reportAppError } from "@/hooks/useToastStore";
import { appErrorMessage } from "@/errors";
import { EmptyState } from "@/components/EmptyState";
import { VaultSwitcher } from "@/components/VaultSwitcher";
import { FileTree } from "@/components/FileTree";
import { useVaultStatus } from "@/hooks/useVault";
import type { VaultInfo } from "@/types/vault";

async function ping(): Promise<string> {
  const result = await ipcInvoke<string>("ping");
  if (!result.ok) {
    reportAppError(result.error);
    throw new Error(appErrorMessage(result.error));
  }
  return result.value;
}

async function pingOrFail(): Promise<string> {
  const result = await ipcInvoke<string>("ping_or_fail");
  if (!result.ok) {
    reportAppError(result.error);
    throw new Error(appErrorMessage(result.error));
  }
  return result.value;
}

function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("dev") === "1";
}

function DevPanel() {
  const [pingResult, setPingResult] = useState<string | null>(null);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["ping"],
    queryFn: ping,
  });
  return (
    <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
      <div data-testid="ping-status">
        {isPending && <span>calling ping…</span>}
        {isError && <span className="text-rose-400">ping failed: {String(error)}</span>}
        {data !== undefined && <span className="text-emerald-400">ping: {data}</span>}
      </div>
      {pingResult && <span className="text-zinc-400">{pingResult}</span>}
      <button
        type="button"
        data-testid="trigger-error"
        onClick={() => {
          void pingOrFail()
            .then((v) => setPingResult(`ping_or_fail: ${v}`))
            .catch(() => undefined);
        }}
        className="rounded border border-rose-700 px-2 py-1 text-rose-300 hover:bg-rose-900/40"
      >
        trigger AppError toast
      </button>
    </div>
  );
}

function SelectedFilePlaceholder({
  vault,
  selectedPath,
  onClear,
}: {
  vault: VaultInfo;
  selectedPath: string;
  onClear: () => void;
}) {
  return (
    <div
      data-testid="selected-file"
      className="flex h-full flex-col bg-zinc-950"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <span className="text-sm font-medium text-zinc-200">{selectedPath}</span>
        <button
          type="button"
          data-testid="close-selection"
          onClick={onClear}
          className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
        >
          ×
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-zinc-500">
        <p className="text-sm">Note selected.</p>
        <p className="text-xs text-zinc-600">
          Editor lands in micro-feature 1.5.
        </p>
        <p className="mt-4 text-[10px] uppercase tracking-wider text-zinc-700">
          {vault.name}
        </p>
      </div>
    </div>
  );
}

function Shell() {
  const { status } = useVaultStatus();
  const [selectedPath, setSelectedPath] = useState<string>("");

  if (status.kind !== "open") return <EmptyState />;

  function handleSelect(path: string) {
    setSelectedPath(path);
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <span className="text-sm font-semibold tracking-tight">OBSIDIANA</span>
        <VaultSwitcher vault={status.vault} />
        {isDevMode() && <DevPanel />}
      </header>
      <main className="flex flex-1 overflow-hidden">
        <aside
          data-testid="sidebar"
          className="w-72 shrink-0 border-r border-zinc-800"
        >
          <FileTree
            selectedPath={selectedPath || null}
            onSelect={handleSelect}
          />
        </aside>
        <section className="flex-1 overflow-hidden">
          {selectedPath ? (
            <SelectedFilePlaceholder
              vault={status.vault}
              selectedPath={selectedPath}
              onClear={() => setSelectedPath("")}
            />
          ) : (
            <div
              data-testid="empty-main"
              className="flex h-full items-center justify-center text-zinc-500"
            >
              <p className="text-sm">Select a file from the tree.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const { isPending } = useVaultStatus();
  if (isPending) {
    return (
      <div
        data-testid="app-loading"
        className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-500"
      >
        Loading vault…
      </div>
    );
  }
  return <Shell />;
}

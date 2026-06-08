import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ipcInvoke } from "@/ipc";
import { reportAppError } from "@/hooks/useToastStore";
import { appErrorMessage } from "@/errors";
import { EmptyState } from "@/components/EmptyState";
import { VaultSwitcher } from "@/components/VaultSwitcher";
import { FileTree } from "@/components/FileTree";
import { Editor } from "@/components/Editor";
import { TagsPanel } from "@/components/TagsPanel";
import { BacklinksPanel } from "@/components/BacklinksPanel";
import { GraphView } from "@/components/GraphView";
import { IndexStatusChip } from "@/components/IndexStatusChip";
import { useVaultStatus } from "@/hooks/useVault";
import {
  brokenWikilinkPath,
  useCreateNoteMutation,
} from "@/hooks/useFileTree";

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

function DragHandle({ onDrag }: { onDrag: (delta: number) => void }) {
  const dragging = useRef(false);
  const startX = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onDrag(delta);
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onDrag]);

  return (
    <div
      onMouseDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        startX.current = e.clientX;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      className="w-1 cursor-col-resize shrink-0 bg-zinc-800 hover:bg-zinc-600 active:bg-zinc-500 transition-colors"
    />
  );
}

function Shell() {
  const { status } = useVaultStatus();
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [rightTab, setRightTab] = useState<"tags" | "backlinks" | "graph">("graph");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(256);
  const createMutation = useCreateNoteMutation();

  const onSidebarDrag = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(160, Math.min(600, w + delta)));
  }, []);

  const onRightDrag = useCallback((delta: number) => {
    setRightWidth((w) => Math.max(160, Math.min(600, w - delta)));
  }, []);

  if (status.kind !== "open") return <EmptyState />;

  function handleSelect(path: string) {
    setSelectedPath(path);
  }

  function handleJump(resolvedPath: string, _section: string | null) {
    setSelectedPath(resolvedPath);
  }

  function handleBrokenClick(
    target: string,
    sourcePath: string,
    _alias: string | null,
  ) {
    if (!window.confirm(`Create note '${target}'?`)) return;
    const newPath = brokenWikilinkPath(target, sourcePath);
    createMutation.mutate(
      { path: newPath, template: "" },
      {
        onSuccess: () => setSelectedPath(newPath),
      },
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2">
        <button
          type="button"
          data-testid="toggle-sidebar"
          onClick={() => setSidebarOpen((v) => !v)}
          className="rounded p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-sm font-semibold tracking-tight">OBSIDIANA</span>
        <VaultSwitcher vault={status.vault} />
        <IndexStatusChip />
        {isDevMode() && <DevPanel />}
      </header>
      <main className="flex flex-1 overflow-hidden">
        <aside
          data-testid="sidebar"
          className="shrink-0 border-r border-zinc-800 overflow-hidden transition-[width] duration-200"
          style={{ width: sidebarOpen ? sidebarWidth : 0 }}
        >
          {sidebarOpen && (
            <FileTree
              selectedPath={selectedPath || null}
              onSelect={handleSelect}
            />
          )}
        </aside>
        {sidebarOpen && (
          <DragHandle onDrag={onSidebarDrag} />
        )}
        <section className="flex flex-1 overflow-hidden min-w-0">
          {selectedPath ? (
            <div className="flex flex-1 min-w-0">
            <Editor
              path={selectedPath}
              onClose={() => setSelectedPath("")}
              onJump={handleJump}
              onBrokenClick={handleBrokenClick}
            />
            </div>
          ) : (
            <div
              data-testid="empty-main"
              className="flex h-full items-center justify-center"
            />
          )}
        {selectedPath ? (
          <>
            <button
              type="button"
              data-testid="toggle-right-pane"
              onClick={() => setRightOpen((v) => !v)}
              className="shrink-0 border-l border-zinc-800 px-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 flex items-center"
              title={rightOpen ? "Collapse panel" : "Expand panel"}
            >
              <svg className={`h-3 w-3 transition-transform duration-200 ${rightOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {rightOpen && (
              <DragHandle onDrag={onRightDrag} />
            )}
          <aside
            data-testid="right-pane"
            className="shrink-0 border-l border-zinc-800 overflow-hidden"
            style={{ width: rightOpen ? rightWidth : 0 }}
          >
            <div role="tablist" className="flex border-b border-zinc-800 text-xs">
              <button
                type="button"
                role="tab"
                data-testid="tab-tags"
                aria-selected={rightTab === "tags"}
                onClick={() => setRightTab("tags")}
                className={`flex-1 px-3 py-2 ${
                  rightTab === "tags"
                    ? "text-zinc-100 border-b-2 border-emerald-500"
                    : "text-zinc-500"
                }`}
              >
                Tags
              </button>
              <button
                type="button"
                role="tab"
                data-testid="tab-backlinks"
                aria-selected={rightTab === "backlinks"}
                onClick={() => setRightTab("backlinks")}
                className={`flex-1 px-3 py-2 ${
                  rightTab === "backlinks"
                    ? "text-zinc-100 border-b-2 border-emerald-500"
                    : "text-zinc-500"
                }`}
              >
                Backlinks
              </button>
              <button
                type="button"
                role="tab"
                data-testid="tab-graph"
                aria-selected={rightTab === "graph"}
                onClick={() => setRightTab("graph")}
                className={`flex-1 px-3 py-2 ${
                  rightTab === "graph"
                    ? "text-zinc-100 border-b-2 border-emerald-500"
                    : "text-zinc-500"
                }`}
              >
                Graph
              </button>
            </div>
            {rightTab === "tags" ? (
              <TagsPanel path={selectedPath} />
            ) : rightTab === "graph" ? (
              <GraphView activePath={selectedPath} onNodeClick={handleSelect} />
            ) : (
              <BacklinksPanel
                path={selectedPath}
                onNavigate={(p) => handleJump(p, null)}
              />
            )}
          </aside>
          </>
        ) : null}
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

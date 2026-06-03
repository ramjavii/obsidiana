import { useQuery } from "@tanstack/react-query";
import { ipcInvoke } from "@/ipc";
import { reportAppError } from "@/hooks/useToastStore";
import { appErrorMessage } from "@/errors";

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

export default function App() {
  const devMode = isDevMode();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["ping"],
    queryFn: ping,
  });

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">OBSIDIANA</h1>
        <p className="mt-4 text-zinc-400">Tauri v2 scaffold running.</p>
        <div className="mt-8 text-sm" data-testid="ping-status">
          {isPending && <span className="text-zinc-500">calling ping…</span>}
          {isError && (
            <span className="text-rose-400">ping failed: {String(error)}</span>
          )}
          {data !== undefined && (
            <span className="text-emerald-400">ping: {data}</span>
          )}
        </div>
        {devMode && (
          <div className="mt-8 flex flex-col items-center gap-2 text-xs text-zinc-500">
            <span>dev mode (?dev=1)</span>
            <button
              type="button"
              onClick={() => {
                void pingOrFail();
              }}
              className="rounded border border-rose-700 px-2 py-1 text-rose-300 hover:bg-rose-900/40"
              data-testid="trigger-error"
            >
              trigger AppError toast
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

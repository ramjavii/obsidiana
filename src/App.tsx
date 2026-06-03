import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

async function ping(): Promise<string> {
  return invoke<string>("ping");
}

export default function App() {
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
      </div>
    </main>
  );
}

import { useEffect } from "react";
import { useToastStore } from "@/hooks/useToastStore";
import type { ToastKind } from "@/hooks/useToastStore";

const KIND_STYLES: Record<ToastKind, string> = {
  info: "bg-zinc-800 text-zinc-100 border-zinc-700",
  success: "bg-emerald-900/80 text-emerald-50 border-emerald-700",
  error: "bg-rose-900/80 text-rose-50 border-rose-700",
};

const TOAST_TTL_MS = 5000;

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      window.setTimeout(() => dismiss(t.id), TOAST_TTL_MS),
    );
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [toasts, dismiss]);

  return (
    <div
      data-testid="toast-host"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid={`toast-${t.kind}`}
          className={`pointer-events-auto flex items-start justify-between gap-2 rounded border px-3 py-2 text-sm shadow-lg ${KIND_STYLES[t.kind]}`}
          role="status"
        >
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="text-xs opacity-70 hover:opacity-100"
            aria-label="dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

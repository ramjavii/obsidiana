import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { isAppError, type AppError } from "@/errors";

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError; raw: unknown };

export async function ipcInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<IpcResult<T>> {
  try {
    const value = await tauriInvoke<T>(cmd, args);
    return { ok: true, value };
  } catch (raw) {
    if (isAppError(raw)) {
      return { ok: false, error: raw, raw };
    }
    return {
      ok: false,
      error: {
        kind: "Internal",
        data: { message: raw instanceof Error ? raw.message : String(raw) },
      },
      raw,
    };
  }
}

export function isIpcError<T>(result: IpcResult<T>): result is { ok: false; error: AppError; raw: unknown } {
  return !result.ok;
}

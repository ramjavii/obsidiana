export type AppError =
  | { kind: "Internal"; data: { message: string } }
  | { kind: "NotFound"; data: { what: string } }
  | { kind: "InvalidArgument"; data: { message: string } }
  | { kind: "Io"; data: { path: string; source: string } };

export const APP_ERROR_VARIANTS = [
  "Internal",
  "NotFound",
  "InvalidArgument",
  "Io",
] as const;

export type AppErrorKind = (typeof APP_ERROR_VARIANTS)[number];

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { kind?: unknown; data?: unknown };
  if (typeof candidate.kind !== "string") return false;
  if (typeof candidate.data !== "object" || candidate.data === null) return false;
  return (APP_ERROR_VARIANTS as readonly string[]).includes(candidate.kind);
}

export function parseAppError(value: unknown): AppError | null {
  if (!isAppError(value)) return null;
  return value;
}

export function appErrorMessage(err: AppError): string {
  switch (err.kind) {
    case "Internal":
      return `Internal error: ${err.data.message}`;
    case "NotFound":
      return `Not found: ${err.data.what}`;
    case "InvalidArgument":
      return `Invalid input: ${err.data.message}`;
    case "Io":
      return `Couldn't read ${err.data.path}: ${err.data.source}`;
  }
}

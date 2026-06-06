export type IndexStateKind =
  | "missing"
  | "indexing"
  | "ready"
  | "broken"
  | "failed";

export type IndexState =
  | { state: "missing" }
  | { state: "indexing" }
  | { state: "ready" }
  | { state: "broken"; quarantinedTo: string }
  | { state: "failed"; message: string };

export type IndexStatus = {
  state: IndexStateKind;
  quarantinedTo?: string;
  message?: string;
  schemaVer: number;
  documentCount: number;
  lastRebuiltAt: string | null;
};

export function isBroken(
  status: IndexStatus,
): status is IndexStatus & { state: "broken"; quarantinedTo: string } {
  return status.state === "broken";
}

export function isFailed(
  status: IndexStatus,
): status is IndexStatus & { state: "failed"; message: string } {
  return status.state === "failed";
}

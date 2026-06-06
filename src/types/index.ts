export type IndexStateKind =
  | "missing"
  | "indexing"
  | "ready"
  | "broken"
  | "failed";

export type IndexStatus = {
  schemaVer: number;
  documentCount: number;
  lastRebuiltAt: string | null;
} & (
  | { state: "missing" }
  | { state: "indexing"; indexed?: number; total?: number }
  | { state: "ready" }
  | { state: "broken"; quarantinedTo: string }
  | { state: "failed"; message: string }
);

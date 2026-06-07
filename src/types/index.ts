export type IndexStateKind =
  | "missing"
  | "indexing"
  | "ready"
  | "broken"
  | "failed";

export interface GraphNode {
  id: string;
  title: string;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface GraphFilter {
  activePath?: string;
  maxHops: number;
  hideOrphans: boolean;
}

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

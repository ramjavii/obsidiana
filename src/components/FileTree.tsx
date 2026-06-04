import { useEffect, useRef, useState } from "react";
import {
  parentOf,
  useCreateNoteMutation,
  useDeleteNoteMutation,
  useRenameNoteMutation,
  useTreeChildren,
} from "@/hooks/useFileTree";
import type { TreeNode } from "@/types/tree";

type FileTreeProps = {
  selectedPath: string | null;
  onSelect: (path: string) => void;
};

type ContextMenuState = {
  x: number;
  y: number;
  node: TreeNode;
} | null;

function withNoteExtension(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return name;
  return `${name}.md`;
}

export function FileTree({ selectedPath, onSelect }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const root = useTreeChildren(null);
  const createMutation = useCreateNoteMutation();
  const deleteMutation = useDeleteNoteMutation();
  const renameMutation = useRenameNoteMutation();
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && target.closest("[data-context-menu]")) return;
      setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function createNoteAt(parentPath: string | null, rawName: string) {
    const name = withNoteExtension(rawName.trim());
    if (!name || name === ".md") return;
    const fullPath = parentPath ? `${parentPath}/${name}` : name;
    try {
      await createMutation.mutateAsync({ path: fullPath, template: "" });
    } catch {
      // error already toasted
    }
  }

  async function handleNewAtRoot() {
    const raw = window.prompt("New note name", "untitled.md");
    if (raw === null) return;
    await createNoteAt(null, raw);
  }

  async function handleContextAction(action: "new" | "rename" | "delete", node: TreeNode) {
    setContextMenu(null);
    if (action === "new") {
      const raw = window.prompt("New note name", "untitled.md");
      if (raw === null) return;
      const parentPath = node.kind === "dir" ? node.path : null;
      await createNoteAt(parentPath, raw);
    } else if (action === "rename") {
      const raw = window.prompt("New name", node.name);
      if (raw === null) return;
      const trimmed = raw.trim();
      if (!trimmed || trimmed === node.name) return;
      const finalName = withNoteExtension(trimmed);
      const dir = parentOf(node.path);
      const newPath = dir ? `${dir}/${finalName}` : finalName;
      try {
        await renameMutation.mutateAsync({ from: node.path, to: newPath });
      } catch {
        // error already toasted
      }
    } else if (action === "delete") {
      if (!window.confirm(`Delete ${node.name}?`)) return;
      try {
        await deleteMutation.mutateAsync({ path: node.path });
      } catch {
        // error already toasted
      }
      if (selectedPath === node.path) onSelect("");
    }
  }

  return (
    <div
      ref={containerRef}
      data-testid="file-tree"
      className="flex h-full flex-col bg-zinc-950"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Files
        </span>
        <button
          type="button"
          data-testid="new-note-root"
          onClick={handleNewAtRoot}
          className="ml-auto rounded border border-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1 text-sm">
        {root.isPending && (
          <div data-testid="tree-loading" className="px-3 py-2 text-zinc-600">
            Loading…
          </div>
        )}
        {root.isError && (
          <div data-testid="tree-error" className="px-3 py-2 text-rose-400">
            Failed to load tree
          </div>
        )}
        {root.data && root.data.length === 0 && (
          <div
            data-testid="empty-tree"
            className="px-3 py-2 text-xs text-zinc-600"
          >
            No notes yet. Click "+ New" to create one.
          </div>
        )}
        {root.data?.map((node) => (
          <FileTreeNode
            key={node.path}
            node={node}
            level={0}
            expanded={expanded}
            onToggle={toggleExpand}
            onSelect={onSelect}
            onContextMenu={(e, n) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, node: n });
            }}
            selectedPath={selectedPath}
          />
        ))}
      </div>
      {contextMenu && (
        <div
          data-context-menu
          data-testid="context-menu"
          className="fixed z-50 min-w-[160px] rounded border border-zinc-700 bg-zinc-900 py-1 text-sm shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.node.kind === "dir" && (
            <button
              type="button"
              data-testid="context-new"
              onClick={() => handleContextAction("new", contextMenu.node)}
              className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
            >
              New note here
            </button>
          )}
          <button
            type="button"
            data-testid="context-rename"
            onClick={() => handleContextAction("rename", contextMenu.node)}
            className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
          >
            Rename
          </button>
          <button
            type="button"
            data-testid="context-delete"
            onClick={() => handleContextAction("delete", contextMenu.node)}
            className="block w-full px-3 py-1.5 text-left text-rose-300 hover:bg-rose-900/40"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

type FileTreeNodeProps = {
  node: TreeNode;
  level: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void;
  selectedPath: string | null;
};

function FileTreeNode({
  node,
  level,
  expanded,
  onToggle,
  onSelect,
  onContextMenu,
  selectedPath,
}: FileTreeNodeProps) {
  const isDir = node.kind === "dir";
  const isOpen = isDir && expanded.has(node.path);
  const isSelected = node.path === selectedPath;
  const children = useTreeChildren(isOpen ? node.path : null, { enabled: isOpen });

  return (
    <>
      <div
        data-testid={`node-${node.path}`}
        data-kind={node.kind}
        data-selected={isSelected ? "true" : "false"}
        className={[
          "flex cursor-pointer items-center gap-1 py-0.5 pr-2 hover:bg-zinc-900",
          isSelected ? "bg-zinc-800 text-zinc-100" : "text-zinc-300",
        ].join(" ")}
        style={{ paddingLeft: `${level * 14 + 6}px` }}
        onClick={() => {
          if (isDir) onToggle(node.path);
          else onSelect(node.path);
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        <span className="inline-block w-3 text-center text-[10px] text-zinc-600">
          {isDir ? (isOpen ? "▾" : "▸") : ""}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      {isOpen && (
        <div data-testid={`children-${node.path}`}>
          {children.isPending && (
            <div
              data-testid={`children-loading-${node.path}`}
              className="text-xs text-zinc-600"
              style={{ paddingLeft: `${(level + 1) * 14 + 6}px` }}
            >
              Loading…
            </div>
          )}
          {children.isError && (
            <div
              data-testid={`children-error-${node.path}`}
              className="text-xs text-rose-400"
              style={{ paddingLeft: `${(level + 1) * 14 + 6}px` }}
            >
              Failed
            </div>
          )}
          {children.data && children.data.length === 0 && (
            <div
              className="text-xs text-zinc-600"
              style={{ paddingLeft: `${(level + 1) * 14 + 6}px` }}
            >
              (empty)
            </div>
          )}
          {children.data?.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </>
  );
}

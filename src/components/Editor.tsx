import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Compartment,
  EditorState,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  WIKILINK_CLICK_HANDLER,
  wikilinkHighlight,
  type WikilinkClickActions,
} from "@/extensions/wikilinkHighlight";
import { inlineRender } from "@/extensions/inlineRender";
import { noteKey, useReadNote, useWriteNoteMutation } from "@/hooks/useNote";
import { useWatcher } from "@/hooks/useWatcher";
import { reportError } from "@/hooks/useToastStore";
import {
  useExtractWikilinks,
  useRenderMarkdown,
  useWikilinkResolutionMap,
  wikilinkMapKey,
} from "@/hooks/useMarkdown";
import type { RenderedNote, ResolvedLink } from "@/types/markdown";

type Status = "loading" | "idle" | "saving" | "saved" | "error";

type Props = {
  path: string;
  onClose: () => void;
  onJump?: (resolvedPath: string, section: string | null) => void;
  onBrokenClick?: (target: string, sourcePath: string, alias: string | null) => void;
};

const AUTOSAVE_DEBOUNCE_MS = 500;
const NOOP = () => undefined;

function readMap(
  map: Map<string, ResolvedLink>,
  target: string,
  alias: string | null,
): ResolvedLink | null {
  return map.get(wikilinkMapKey(target, alias)) ?? null;
}

export function Editor({
  path,
  onClose,
  onJump,
  onBrokenClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const viewPathRef = useRef<string | null>(null);
  const persistedDocRef = useRef<string>("");
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef<string>(path);
  const onCloseRef = useRef<() => void>(onClose);
  const onJumpRef = useRef<(resolvedPath: string, section: string | null) => void>(
    onJump ?? NOOP,
  );
  const onBrokenClickRef = useRef<
    (target: string, sourcePath: string, alias: string | null) => void
  >(onBrokenClick ?? NOOP);
  const compartmentRef = useRef<Compartment | null>(null);
  if (compartmentRef.current === null) {
    compartmentRef.current = new Compartment();
  }
  const mapRef = useRef<Map<string, ResolvedLink>>(new Map());
  const renderedRef = useRef<RenderedNote | null>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [needsReload, setNeedsReload] = useState(false);

  const read = useReadNote(path);
  const write = useWriteNoteMutation();
  const queryClient = useQueryClient();
  const wikilinksQuery = useExtractWikilinks(path, { enabled: read.data !== undefined });
  const wikilinks = wikilinksQuery.data ?? [];
  const resolutionMap = useWikilinkResolutionMap(path, wikilinks);
  const renderedQuery = useRenderMarkdown(path, {
    enabled: read.data !== undefined,
  });

  mapRef.current = resolutionMap;
  renderedRef.current = renderedQuery.data ?? null;

  useWatcher(
    (change) => {
      if (change.path !== pathRef.current) return;
      const view = viewRef.current;
      if (view === null) return;
      const isDirty = view.state.doc.toString() !== persistedDocRef.current;
      if (isDirty) {
        setNeedsReload(true);
        return;
      }
      setNeedsReload(false);
      void queryClient.invalidateQueries({ queryKey: noteKey(pathRef.current) });
    },
    { enabled: path !== "" },
  );

  const flushSaveRef = useRef<() => Promise<void>>(async () => undefined);

  const flushSave = useCallback(async (contentOverride?: string) => {
    if (pendingTimeoutRef.current !== null) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
    const view = viewRef.current;
    if (view === null) return;
    const content = contentOverride ?? view.state.doc.toString();
    if (content === persistedDocRef.current) {
      setStatus("saved");
      setNeedsReload(false);
      return;
    }
    setStatus("saving");
    try {
      await write.mutateAsync({ path: pathRef.current, content });
      persistedDocRef.current = content;
      setStatus("saved");
      setNeedsReload(false);
    } catch {
      setStatus("error");
      reportError(`Failed to save ${pathRef.current}`);
    }
  }, [write]);

  useEffect(() => {
    flushSaveRef.current = flushSave;
  }, [flushSave]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onJumpRef.current = onJump ?? NOOP;
  }, [onJump]);

  useEffect(() => {
    onBrokenClickRef.current = onBrokenClick ?? NOOP;
  }, [onBrokenClick]);

  useEffect(() => {
    const view = viewRef.current;
    const comp = compartmentRef.current;
    if (view === null || comp === null) return;
    view.dispatch({
      effects: comp.reconfigure(
        wikilinkHighlight((target, alias) => readMap(mapRef.current, target, alias)),
      ),
    });
  }, [resolutionMap]);

  useEffect(() => {
    if (read.data === undefined) return;
    const container = containerRef.current;
    if (container === null) return;

    if (viewPathRef.current !== null && viewPathRef.current !== path) {
      setNeedsReload(false);
    }

    pathRef.current = path;

    if (viewRef.current !== null && viewPathRef.current !== path) {
      if (pendingTimeoutRef.current !== null) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
      const oldPath = viewPathRef.current ?? path;
      const pendingContent = viewRef.current.state.doc.toString();
      if (pendingContent !== persistedDocRef.current) {
        setStatus("saving");
        write.mutate(
          { path: oldPath, content: pendingContent },
          {
            onSuccess: () => {
              persistedDocRef.current = pendingContent;
              setStatus("saved");
            },
            onError: () => {
              setStatus("error");
              reportError(`Failed to save ${oldPath}`);
            },
          },
        );
      }
      viewRef.current.destroy();
      viewRef.current = null;
      viewPathRef.current = null;
      persistedDocRef.current = "";
    }

    if (viewRef.current === null) {
      persistedDocRef.current = read.data.content;
      setStatus("saved");

      const updateListener = EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        if (pendingTimeoutRef.current !== null) {
          clearTimeout(pendingTimeoutRef.current);
        }
        setStatus("saving");
        pendingTimeoutRef.current = setTimeout(() => {
          void flushSaveRef.current();
        }, AUTOSAVE_DEBOUNCE_MS);
      });

      const saveKeymap = keymap.of([
        {
          key: "Mod-s",
          preventDefault: true,
          run: () => {
            void flushSaveRef.current();
            return true;
          },
        },
      ]);

      const clickActions: WikilinkClickActions = {
        onJump: (resolvedPath, section) => onJumpRef.current(resolvedPath, section),
        onBrokenClick: (target, sourcePath, alias) =>
          onBrokenClickRef.current(target, sourcePath, alias),
        getState: (target, alias) => readMap(mapRef.current, target, alias),
        getSourcePath: () => pathRef.current,
      };

      const compartment = compartmentRef.current;
      if (compartment === null) return;

      const extensions: Extension[] = [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown(),
        oneDark,
        compartment.of(
          wikilinkHighlight((target, alias) => readMap(mapRef.current, target, alias)),
        ),
        inlineRender(() => renderedRef.current),
        WIKILINK_CLICK_HANDLER(clickActions),
        saveKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        updateListener,
      ];

      const state = EditorState.create({
        doc: read.data.content,
        extensions,
      });
      viewRef.current = new EditorView({ state, parent: container });
      viewPathRef.current = path;
      return;
    }

    if (read.data.content !== persistedDocRef.current) {
      const view = viewRef.current;
      const currentContent = view.state.doc.toString();
      if (currentContent !== read.data.content) {
        view.dispatch({
          changes: { from: 0, to: currentContent.length, insert: read.data.content },
        });
      }
      persistedDocRef.current = read.data.content;
    }
  }, [path, read.data, write]);

  useEffect(() => {
    return () => {
      if (pendingTimeoutRef.current !== null) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
      const view = viewRef.current;
      if (view !== null) {
        view.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  const handleReload = useCallback(() => {
    setNeedsReload(false);
    void queryClient.invalidateQueries({ queryKey: noteKey(pathRef.current) });
  }, [queryClient]);

  const handleDiscard = useCallback(() => {
    setNeedsReload(false);
    void queryClient.invalidateQueries({ queryKey: noteKey(pathRef.current) });
  }, [queryClient]);

  const handleClose = useCallback(() => {
    void flushSave().finally(() => onCloseRef.current());
  }, [flushSave]);

  const statusLabel: Record<Status, string> = {
    loading: "Loading…",
    idle: "Idle",
    saving: "Saving…",
    saved: "Saved",
    error: "Error",
  };
  const statusClass =
    status === "saving"
      ? "text-amber-300"
      : status === "saved"
        ? "text-emerald-400"
        : status === "error"
          ? "text-rose-400"
          : "text-zinc-500";

  return (
    <div
      data-testid="editor"
      data-editor-path={path}
      data-editor-mode="livePreview"
      className="flex h-full flex-col bg-zinc-950"
    >
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <span className="text-sm font-medium text-zinc-200">{path}</span>
        <span data-testid="editor-status" className={`text-xs ${statusClass}`}>
          {statusLabel[status]}
        </span>
        <button
          type="button"
          data-testid="editor-close"
          onClick={handleClose}
          className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
        >
          ×
        </button>
      </div>
      {needsReload ? (
        <div
          data-testid="fs-change-reload-needed"
          className="flex items-center justify-between border-b border-amber-700 bg-amber-950/60 px-4 py-1 text-xs text-amber-200"
        >
          <span>File changed on disk.</span>
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="fs-change-reload"
              onClick={handleReload}
              className="rounded border border-amber-600 px-2 py-0.5 text-amber-100 hover:bg-amber-800"
            >
              Reload
            </button>
            <button
              type="button"
              data-testid="fs-change-discard"
              onClick={handleDiscard}
              className="rounded border border-zinc-600 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700"
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}
      <div
        ref={containerRef}
        data-testid="editor-container"
        className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
      />
    </div>
  );
}

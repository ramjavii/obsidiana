import { useCallback, useEffect, useRef, useState } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { useReadNote, useWriteNoteMutation } from "@/hooks/useNote";
import { reportError } from "@/hooks/useToastStore";

type Status = "loading" | "idle" | "saving" | "saved" | "error";

type Props = {
  path: string;
  onClose: () => void;
};

const AUTOSAVE_DEBOUNCE_MS = 500;

export function Editor({ path, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const viewPathRef = useRef<string | null>(null);
  const persistedDocRef = useRef<string>("");
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathRef = useRef<string>(path);
  const onCloseRef = useRef<() => void>(onClose);

  const [status, setStatus] = useState<Status>("loading");

  const read = useReadNote(path);
  const write = useWriteNoteMutation();

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
      return;
    }
    setStatus("saving");
    try {
      await write.mutateAsync({ path: pathRef.current, content });
      persistedDocRef.current = content;
      setStatus("saved");
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
    if (read.data === undefined) return;
    const container = containerRef.current;
    if (container === null) return;

    pathRef.current = path;

    if (viewRef.current !== null && viewPathRef.current !== path) {
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

      const extensions: Extension[] = [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown(),
        oneDark,
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
  }, [path, read.data]);

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
      <div
        ref={containerRef}
        data-testid="editor-container"
        className="flex-1 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
      />
    </div>
  );
}

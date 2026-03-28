import { useEffect, useRef, type ReactNode } from "react";
import type * as monaco from "monaco-editor";
import * as monacoNs from "monaco-editor";
import { MonacoBinding } from "y-monaco";
import type { Text as YText } from "yjs";
import { bindRemoteCursorChannel } from "../../lib/collab/remoteCursorChannel.js";
import { languageFromPath } from "./languageFromPath.js";
import "./yMonacoRemote.css";

export function CollabMonacoEditor({
  workspaceId,
  activePath,
  ytext,
  localUser,
  cursorColorHex,
}: {
  workspaceId: string;
  activePath: string | null;
  ytext: YText | null;
  localUser: { id: string; name: string };
  /** #rrggbb pentru etichete și caret în canalul CURSOR_MOVE */
  cursorColorHex: string;
}): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const editor = monacoNs.editor.create(el, {
      automaticLayout: true,
      theme: "vs-dark",
      minimap: { enabled: false },
      fontSize: 14,
      scrollBeyondLastLine: false,
    });
    editorRef.current = editor;

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
      modelRef.current?.dispose();
      modelRef.current = null;
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    bindingRef.current?.destroy();
    bindingRef.current = null;
    modelRef.current?.dispose();
    modelRef.current = null;

    if (!activePath || !ytext) {
      editor.setModel(null);
      return;
    }

    const lang = languageFromPath(activePath);
    const uri = monacoNs.Uri.parse(
      `itecify://${encodeURIComponent(workspaceId)}/${encodeURIComponent(activePath)}`,
    );
    const model = monacoNs.editor.createModel("", lang, uri);
    editor.setModel(model);
    modelRef.current = model;

    /** Fără awareness: cursori remote doar prin /ws-cursor (fără decorații duplicate y-monaco). */
    const binding = new MonacoBinding(ytext, model, new Set([editor]), null);
    bindingRef.current = binding;

    const disposeCursors = bindRemoteCursorChannel({
      workspaceId,
      filePath: activePath,
      localUserId: localUser.id,
      displayName: localUser.name,
      color: cursorColorHex,
      editor,
      model,
    });

    return () => {
      disposeCursors();
      binding.destroy();
      model.dispose();
    };
  }, [activePath, workspaceId, ytext, localUser.id, localUser.name, cursorColorHex]);

  return (
    <div
      ref={hostRef}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        borderLeft: "1px solid #1e1e1e",
      }}
    />
  );
}

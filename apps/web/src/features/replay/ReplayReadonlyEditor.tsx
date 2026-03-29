import { useEffect, useRef, type ReactNode } from "react";
import type { Text as YText } from "yjs";
import * as monacoNs from "monaco-editor";
import { languageFromPath } from "../editor/languageFromPath.js";

/**
 * Editor Monaco doar-citire pentru snapshot-uri de replay (fără legătură la collab live).
 */
export function ReplayReadonlyEditor({
  workspaceId,
  activePath,
  ytext,
}: {
  workspaceId: string;
  activePath: string | null;
  ytext: YText | null;
}): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monacoNs.editor.ITextModel | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const editor = monacoNs.editor.create(el, {
      automaticLayout: true,
      theme: "vs-dark",
      minimap: { enabled: false },
      fontSize: 14,
      scrollBeyondLastLine: false,
      readOnly: true,
    });
    editorRef.current = editor;

    return () => {
      modelRef.current?.dispose();
      modelRef.current = null;
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    modelRef.current?.dispose();
    modelRef.current = null;

    if (!activePath || !ytext) {
      editor.setModel(null);
      return;
    }

    const lang = languageFromPath(activePath);
    const uri = monacoNs.Uri.parse(
      `itecify-replay://${encodeURIComponent(workspaceId)}/${encodeURIComponent(activePath)}`,
    );
    const model = monacoNs.editor.createModel(ytext.toString(), lang, uri);
    modelRef.current = model;
    editor.setModel(model);

    const sync = (): void => {
      model.setValue(ytext.toString());
    };
    ytext.observe(sync);
    return () => {
      ytext.unobserve(sync);
      model.dispose();
      modelRef.current = null;
    };
  }, [activePath, workspaceId, ytext]);

  return (
    <div
      ref={hostRef}
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        borderLeft: "1px solid #2a3340",
      }}
    />
  );
}

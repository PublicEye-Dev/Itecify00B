import { useEffect, useRef, type ReactNode } from "react";
import type * as monaco from "monaco-editor";
import * as monacoNs from "monaco-editor";
import { MonacoBinding } from "y-monaco";
import type { Text as YText } from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { languageFromPath } from "./languageFromPath.js";

/**
 * Legătură între `Y.Text` și un model Monaco prin `y-monaco`.
 * La schimbarea fișierului: distrugem binding + modelul vechi și creăm altele noi
 * (același editor `IStandaloneCodeEditor`, alt `ITextModel`).
 */
export function CollabMonacoEditor({
  workspaceId,
  activePath,
  ytext,
  awareness,
}: {
  workspaceId: string;
  activePath: string | null;
  ytext: YText | null;
  awareness: Awareness | undefined;
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

    const binding = new MonacoBinding(ytext, model, new Set([editor]), awareness ?? null);
    bindingRef.current = binding;

    return () => {
      binding.destroy();
      model.dispose();
    };
  }, [activePath, awareness, workspaceId, ytext]);

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

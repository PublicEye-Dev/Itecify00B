/**
 * Monaco folosește web workers pentru TS/JSON/etc. Fără acest hook,
 * Vite încarcă editorul dar language features crapă tăcut.
 */
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

type MonacoEnvironment = {
  getWorker: (workerId: string, label: string) => Worker;
};

const g = globalThis as typeof globalThis & { MonacoEnvironment?: MonacoEnvironment };

g.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case "typescript":
      case "javascript":
        return new tsWorker();
      case "json":
        return new jsonWorker();
      default:
        return new editorWorker();
    }
  },
};

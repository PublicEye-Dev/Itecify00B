import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [react()],
  optimizeDeps: {
    include: ["monaco-editor", "yjs", "y-websocket", "y-monaco"],
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    host: process.env.WEB_HOST ?? "0.0.0.0",
    /**
     * Rădăcina monorepo-ului e envDir; Vite urmărește .env implicit și repornește la fiecare salvare.
     * Pe Windows asta e zgomotos (și poate fi confundat cu un crash). Ignorăm fișierele .env:
     * după modificare `VITE_*` repornește manual Vite (Ctrl+C doar pe procesul web sau `pnpm dev:web`).
     */
    watch: {
      ignored: [
        path.normalize(path.join(monorepoRoot, ".env")),
        path.normalize(path.join(monorepoRoot, ".env.local")),
        path.normalize(path.join(monorepoRoot, ".env.development")),
        path.normalize(path.join(monorepoRoot, ".env.development.local")),
      ],
    },
  },
});

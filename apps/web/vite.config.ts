import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [react()],
  optimizeDeps: {
    include: ["monaco-editor", "yjs", "y-websocket", "y-monaco", "xterm", "xterm-addon-fit"],
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    host: process.env.WEB_HOST ?? "0.0.0.0",
    /** Dev: același origin ca UI → cookie + WebSocket terminal funcționează. */
    proxy: {
      "/auth": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`,
        changeOrigin: true,
        ws: true,
      },
      "/workspaces": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`,
        changeOrigin: true,
        ws: true,
      },
      "/jobs": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`,
        changeOrigin: true,
        ws: true,
      },
      "/health": {
        target: `http://127.0.0.1:${process.env.API_PORT ?? "3001"}`,
        changeOrigin: true,
        ws: true,
      },
    },
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

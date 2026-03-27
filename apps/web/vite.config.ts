import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  envDir: monorepoRoot,
  plugins: [react()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    host: process.env.WEB_HOST ?? "0.0.0.0",
  },
});

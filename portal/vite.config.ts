import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Version aus package.json (Versionierung siehe CLAUDE.md im Wurzelverzeichnis).
const version: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      // Alle /api-Aufrufe ans Suite-Backend weiterleiten
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});

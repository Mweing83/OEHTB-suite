import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: Unter dem Suite-Reverse-Proxy wird das Tool unter "/handkassen/"
// ausgeliefert (per VITE_BASE beim Produktions-Build gesetzt). Dev: "/".
// Version aus package.json (Versionierung siehe CLAUDE.md im Wurzelverzeichnis).
const version: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    // API-Anfragen im Dev an das Backend weiterleiten
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});

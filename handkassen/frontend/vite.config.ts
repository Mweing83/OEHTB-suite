import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: Unter dem Suite-Reverse-Proxy wird das Tool unter "/handkassen/"
// ausgeliefert (per VITE_BASE beim Produktions-Build gesetzt). Dev: "/".
export default defineConfig({
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

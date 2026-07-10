import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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

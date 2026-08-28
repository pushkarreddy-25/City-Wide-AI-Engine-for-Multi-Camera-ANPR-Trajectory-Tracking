import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React dev server proxies API + WebSocket traffic to the FastAPI backend
// (default http://localhost:8000). In production the built assets are served
// by any static host and point at the same-origin API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});

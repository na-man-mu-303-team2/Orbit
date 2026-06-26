import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@orbit/editor-core": fileURLToPath(
        new URL("../../packages/editor-core/src/index.ts", import.meta.url)
      ),
      "@orbit/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.API_BASE_URL ?? "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/socket.io": {
        target: process.env.API_BASE_URL ?? "http://localhost:3000",
        changeOrigin: true,
        ws: true
      }
    }
  }
});

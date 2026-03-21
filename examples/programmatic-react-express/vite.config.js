import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3010",
      "/health": "http://localhost:3010",
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});

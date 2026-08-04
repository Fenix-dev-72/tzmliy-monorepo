import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // The docker-compose `frontend` service bind-mounts this directory from
    // the Windows host into a Linux container -- native fs-change events
    // (inotify) from a Windows-side edit don't reliably reach the container
    // over that mount, so Vite's watcher silently never fires HMR/reload for
    // host-made edits (confirmed 2026-07-27: container logs showed zero "hmr
    // update" lines despite real source changes). Polling works around that
    // by having the watcher actively re-stat files instead of waiting for a
    // kernel event. No effect when running `vite` directly on the host
    // (outside the container), so this is safe to leave on unconditionally.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});

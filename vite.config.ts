/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { serviceWorker } from "./scripts/serviceWorker";

// GitHub Pages project sites live under /<repo-name>/. The deploy workflow sets
// BASE_PATH from the repository name; locally everything is served from "/".
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [react(), serviceWorker()],
  build: {
    // alphaTab (Guitar Pro / MusicXML import) is ~1.2 MB on its own; it's a lazy chunk
    // loaded only when such a file is opened, so its size doesn't touch page load
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: { tone: ["tone", "@tonejs/midi"], react: ["react", "react-dom", "zustand"] },
      },
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  css: {
    preprocessorOptions: { scss: { api: "modern-compiler" } },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});

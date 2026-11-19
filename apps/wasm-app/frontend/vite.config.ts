import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        // kuromoji's dictionary loader uses path.join() to build dict file
        // URLs even in the browser; Vite ships no Node "path" polyfill, so
        // point it at a small posix shim.
        find: /^node:path$/,
        replacement: fileURLToPath(new URL("./src/shims/node-path.ts", import.meta.url)),
      },
      {
        find: /^path$/,
        replacement: fileURLToPath(new URL("./src/shims/node-path.ts", import.meta.url)),
      },
    ],
  },
});

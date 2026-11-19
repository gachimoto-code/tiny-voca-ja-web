import { createReadStream, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Serve the kuromoji dictionary files without a Content-Encoding header.
// Vite's static file server tags *.gz responses with "Content-Encoding:
// gzip", so the browser transparently decompresses them — and kuromoji,
// which gunzips the .dat.gz files itself, then fails with "invalid file
// signature". Streaming the raw bytes here keeps the gzip payload intact.
function kuromojiDictServer(): Plugin {
  const dictDir = fileURLToPath(new URL("./public/kuromoji-dict", import.meta.url));
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
    const file = join(dictDir, name);
    if (!name || !file.startsWith(dictDir) || !existsSync(file) || !statSync(file).isFile()) {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", statSync(file).size);
    createReadStream(file).pipe(res);
  };
  return {
    name: "kuromoji-dict-server",
    configureServer(server) {
      server.middlewares.use("/kuromoji-dict", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/kuromoji-dict", handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), kuromojiDictServer()],
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

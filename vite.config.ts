import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/multiminesweeper/",
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src/engine"),
      "@ui": resolve(__dirname, "src/ui"),
    },
  },
});

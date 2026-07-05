import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@orbit/slide-renderer": resolve(
        __dirname,
        "../../packages/slide-renderer/src/index.ts",
      ),
    },
  },
});

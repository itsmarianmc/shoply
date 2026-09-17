import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(configDirectory, "src"),
      "server-only": path.resolve(configDirectory, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
  },
});

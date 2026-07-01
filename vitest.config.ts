import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest for the deterministic Assessment Integrity logic (pure functions only).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest for the deterministic Assessment Integrity logic and the grade-route
// safety gates (auth-before-quota, daily limit, safe failure payloads).
export default defineConfig({
  resolve: {
    alias: {
      // Route tests import server-only modules outside a React Server
      // environment; the guard package is stubbed FOR TESTS ONLY (the real
      // package still protects the Next.js build).
      "server-only": fileURLToPath(new URL("./lib/testing/server-only-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});

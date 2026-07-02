// Test-only stub for the `server-only` guard package (aliased in
// vitest.config.ts). Lets route-handler tests import server modules in the
// node test environment. Never used by the app build — Next.js resolves the
// real `server-only` package there, so the client-bundle guarantee is intact.
export {};

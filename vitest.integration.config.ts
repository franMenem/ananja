import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Config separada para `npm run test:integration` — ver nota en
 * tests/invariantes.integration.test.ts sobre por qué estos tests no
 * corren dentro de `npm test` (vitest.config.ts).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Ver el mismo alias en vitest.config.ts: `server-only` no es un
      // paquete instalable, solo vive empaquetado dentro de `next/dist/compiled`.
      "server-only": path.resolve(
        __dirname,
        "node_modules/next/dist/compiled/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    testTimeout: 20000,
  },
});

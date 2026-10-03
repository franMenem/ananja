import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Vite (a diferencia del webpack/Turbopack de Next) no resuelve el
      // paquete marcador `server-only` como paquete propio — solo vive
      // empaquetado dentro de `next/dist/compiled`. Alias al build "vacío"
      // que el propio Next usa del lado del servidor (`empty.js`, ver su
      // `package.json` § `exports["react-server"]`) para que los módulos
      // que lo importan (`lib/sesion-actual.ts`, `lib/invitaciones-server.ts`,
      // `lib/supabase/admin.ts`) se puedan importar en los tests sin tirar
      // el error real que ese paquete lanza en un bundle de cliente.
      "server-only": path.resolve(
        __dirname,
        "node_modules/next/dist/compiled/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Los tests de integración (contra Supabase real) corren aparte, con
    // `npm run test:integration` / vitest.integration.config.ts — ver nota
    // en tests/invariantes.integration.test.ts.
    exclude: ["tests/**/*.integration.test.ts", "node_modules/**"],
  },
});

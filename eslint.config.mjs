import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Handoff de diseño (design/handoff/design_handoff_ananja_ui/): prototipos
    // .dc.html y su runtime (support.js), no son código de producción — ver
    // design/handoff/design_handoff_ananja_ui/README.md § Files.
    "design/handoff/**",
  ]),
]);

export default eslintConfig;

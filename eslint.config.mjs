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
  ]),
  {
    rules: {
      // Next 16 ships this as an error; we intentionally set loading flags
      // before async fetches in effects (a common, safe pattern). Downgrade
      // to a warning so the build stays clean without contorting the code.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;

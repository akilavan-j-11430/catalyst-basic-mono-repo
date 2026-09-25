import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // `src/services/api/client.ts` is the only place that speaks HTTP, the way
  // `services/catalyst/` is the only place that reaches Catalyst. Prose drifts; this
  // does not.
  // See `.claude/rules/web_data_access.md`.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/api/client.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Call the API through src/services/ - see .claude/rules/web_data_access.md.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

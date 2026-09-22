import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "appsails/**", ".next/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build scripts run in Node, outside the app's own tsconfig.
    files: ["**/*.mjs", "scripts/**"],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    rules: {
      "no-unused-vars": "off",
      // Express mandates the 4-arg error-handler signature, so unused leading
      // params are load-bearing. The codebase marks them with a leading underscore.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);

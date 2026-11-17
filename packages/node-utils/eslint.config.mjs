import config, { allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// The env test declares a variable name, which is UPPER_SNAKE like any env key.
export default [
  ...config,
  allowVendorNames(["test/unit/utils/env.test.ts"]),
  allowTestsIn(["unit"]),
];

import config, { allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// Environment variable names keep their own casing.
export default [
  ...config,
  allowVendorNames(["src/env.ts"]),
  allowTestsIn(["integration"]),
];

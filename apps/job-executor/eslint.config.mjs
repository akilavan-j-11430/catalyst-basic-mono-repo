import config, { allowCatalystSdk, allowTestsIn, allowVendorNames } from "@repo/eslint-config";

// Only the per-execution initialization touches the SDK directly. Environment variable
// names keep their own casing.
export default [
  ...config,
  allowCatalystSdk(["src/dispatch.ts"]),
  allowVendorNames(["src/env.ts"]),
  allowTestsIn(["unit"]),
];

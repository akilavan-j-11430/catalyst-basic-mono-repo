import config, {
  allowCatalystSdk,
  allowTestsIn,
  allowVendorNames,
} from "@repo/eslint-config";

// This package is the only place a Catalyst SDK may be imported, and the vendor seam, so
// Catalyst's casing stays here. The user-management test feeds in Catalyst's own
// snake_case user record.
export default [
  ...config,
  allowCatalystSdk(["src/**/*.ts"]),
  allowVendorNames(["src/**/*.ts", "test/unit/user-management.test.ts"]),
  allowTestsIn(["unit"]),
];

import config, {
  allowCatalystSdk,
  allowTestsIn,
  allowVendorNames,
} from "@repo/eslint-config";

// catalyst/ is the only place a Catalyst SDK may be imported;
// catalyst/ and repositories/ are the vendor seams, so Catalyst's casing stays there.
// The env test declares a variable name, which is UPPER_SNAKE like any env key; the monitor
// repository test feeds it ZCQL rows, which carry Catalyst's column names; the job test checks
// the cron request exactly as Catalyst receives it.
export default [
  ...config,
  allowCatalystSdk(["src/catalyst/*.ts"]),
  allowVendorNames([
    "src/catalyst/*.ts",
    "src/repositories/*.ts",
    "test/unit/utils/env.test.ts",
    "test/unit/repositories/monitor-repository.test.ts",
    "test/unit/catalyst/job.test.ts",
  ]),
  allowTestsIn(["unit", "integration"]),
];

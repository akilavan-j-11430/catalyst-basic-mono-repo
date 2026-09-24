/**
 * The SDK's enums are split across its build output: the values live in `dist-es/` with
 * no declarations beside them, the declarations in `dist-types/` with no JS. Neither is
 * re-exported from the package root, so this bridges the two - values imported from
 * `dist-es`, typed from `dist-types`. Deleting this file makes `job.ts` fail with TS7016.
 * Both paths are build artefacts; re-check them on every upgrade.
 */
declare module "@zcatalyst/job-scheduling/dist-es/utils/enum.js" {
  export {
    CRON_TYPE,
    TARGET_TYPE,
  } from "@zcatalyst/job-scheduling/dist-types/utils/enum";
}

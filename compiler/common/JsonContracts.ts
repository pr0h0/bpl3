export const CLI_JSON_SCHEMA_VERSION = 1 as const;

export const CLI_JSON_CHECKS = {
  build: "build",
  check: "check",
  clean: "clean",
  doctor: "doctor",
  lint: "lint",
  packageCacheClean: "package-cache-clean",
  packageCacheList: "package-cache-list",
  packageCacheRepair: "package-cache-repair",
  packageCacheVerify: "package-cache-verify",
  packageList: "package-list",
  packageListTree: "package-list-tree",
  packages: "packages",
  runScript: "run-script",
  runScriptList: "run-script-list",
  toolchain: "toolchain",
} as const;

export function createJsonReport<
  Check extends string,
  Payload extends Record<string, unknown>,
>(
  check: Check,
  success: boolean,
  payload: Payload,
): {
  schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  check: Check;
  success: boolean;
} & Payload {
  return {
    schemaVersion: CLI_JSON_SCHEMA_VERSION,
    check,
    success,
    ...payload,
  };
}

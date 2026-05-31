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
  projectNew: "project-new",
  packageInit: "package-init",
  packageInstall: "package-install",
  packageList: "package-list",
  packageListTree: "package-list-tree",
  packagePack: "package-pack",
  packageUninstall: "package-uninstall",
  packages: "packages",
  runScript: "run-script",
  runScriptList: "run-script-list",
  toolchain: "toolchain",
} as const;

export const CLI_JSON_CONTRACTS = [
  { command: "bpl build --json", check: CLI_JSON_CHECKS.build },
  { command: "bpl check --json", check: CLI_JSON_CHECKS.check },
  { command: "bpl lint --json", check: CLI_JSON_CHECKS.lint },
  { command: "bpl doctor --json", check: CLI_JSON_CHECKS.toolchain },
  { command: "bpl doctor sanitizer --json", check: CLI_JSON_CHECKS.toolchain },
  { command: "bpl doctor <unknown> --json", check: CLI_JSON_CHECKS.doctor },
  { command: "bpl doctor packages --json", check: CLI_JSON_CHECKS.packages },
  { command: "bpl new <name> --json", check: CLI_JSON_CHECKS.projectNew },
  {
    command: "bpl package-cache list [package] --json",
    check: CLI_JSON_CHECKS.packageCacheList,
  },
  {
    command: "bpl package-cache verify [package] --json",
    check: CLI_JSON_CHECKS.packageCacheVerify,
  },
  {
    command: "bpl package-cache clean [package] --json",
    check: CLI_JSON_CHECKS.packageCacheClean,
  },
  {
    command: "bpl package-cache repair [package] --json",
    check: CLI_JSON_CHECKS.packageCacheRepair,
  },
  {
    command: "bpl install [package] --json",
    check: CLI_JSON_CHECKS.packageInstall,
  },
  {
    command: "bpl init [name] --json",
    check: CLI_JSON_CHECKS.packageInit,
  },
  {
    command: "bpl pack [dir] --json",
    check: CLI_JSON_CHECKS.packagePack,
  },
  {
    command: "bpl uninstall <package> --json",
    check: CLI_JSON_CHECKS.packageUninstall,
  },
  {
    command: "bpl run-script --list --json",
    check: CLI_JSON_CHECKS.runScriptList,
  },
  { command: "bpl run-script <name> --json", check: CLI_JSON_CHECKS.runScript },
  { command: "bpl clean --dry-run --json", check: CLI_JSON_CHECKS.clean },
  { command: "bpl list --json", check: CLI_JSON_CHECKS.packageList },
  { command: "bpl list --tree --json", check: CLI_JSON_CHECKS.packageListTree },
] as const;

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

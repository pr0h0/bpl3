import { CompilerError } from "../common/CompilerError";
import type {
  CLI_JSON_CHECKS,
  CLI_JSON_SCHEMA_VERSION,
} from "../common/JsonContracts";

export const PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE_CODE =
  "BPL_PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE";
export const PACKAGE_INSTALL_LOCK_VERIFY_FAILED_CODE =
  "BPL_PACKAGE_LOCK_VERIFY_FAILED";
export const PACKAGE_DUPLICATE_INSTALLED_CODE =
  "BPL_PACKAGE_DUPLICATE_INSTALLED";

export type PackageLockVerificationIssueKind =
  | "missing-lockfile"
  | "missing-package"
  | "invalid-package-root"
  | "invalid-manifest"
  | "name-mismatch"
  | "version-mismatch"
  | "hash-mismatch"
  | "untracked-package"
  | "missing-transitive-lock-entry"
  | "missing-transitive-dependency"
  | "duplicate-installed-package"
  | "unreachable-source";

export interface PackageLockVerificationIssue {
  packageName: string;
  kind: PackageLockVerificationIssueKind;
  message: string;
  packagePath?: string;
  paths?: string[];
  source?: string;
  expectedVersion?: string;
  actualVersion?: string;
  expectedName?: string;
  actualName?: string;
  expectedHash?: string;
  actualHash?: string;
  dependencyOf?: string;
  requestedSource?: string;
}

export interface PackageInstalledNameIssue {
  packageName: string;
  kind: "duplicate-installed-package";
  message: string;
  path: string;
  paths: string[];
}

export interface PackageLockVerification {
  ok: boolean;
  errors: string[];
  issues: PackageLockVerificationIssue[];
  packagesChecked: number;
}

export class PackageLockVerificationError extends CompilerError {
  constructor(
    public readonly verification: PackageLockVerification,
    lockFilePath: string,
    hint: string,
  ) {
    super(
      `Lockfile verification failed:\n${verification.errors.join("\n")}`,
      hint,
      {
        file: lockFilePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
      PACKAGE_INSTALL_LOCK_VERIFY_FAILED_CODE,
    );
    this.name = "PackageLockVerificationError";
  }
}

export class PackageInstalledNameError extends CompilerError {
  constructor(
    public readonly issues: PackageInstalledNameIssue[],
    packageDirectory: string,
  ) {
    super(
      `Duplicate installed package names:\n${issues.map((issue) => issue.message).join("\n")}`,
      "Keep only one installed directory for each package name, then rerun the package command.",
      {
        file: packageDirectory,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
      PACKAGE_DUPLICATE_INSTALLED_CODE,
    );
    this.name = "PackageInstalledNameError";
  }
}

export interface PackageDependencyTreeNode {
  name: string;
  version?: string;
  source?: string;
  path?: string;
  installed: boolean;
  locked: boolean;
  dependencies: PackageDependencyTreeNode[];
  problems: string[];
}

export interface PackageCacheEntry {
  name: string;
  version: string;
  file: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
  archiveSha256?: string;
  packageHash?: string;
  provenancePath: string;
  provenanceStatus:
    | "verified"
    | "missing"
    | "invalid"
    | "archive-hash-mismatch"
    | "manifest-mismatch";
  provenanceIssue?: string;
}

export interface PackageCacheCleanResult {
  schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  check: typeof CLI_JSON_CHECKS.packageCacheClean;
  success: boolean;
  removed: PackageCacheEntry[];
  dryRun: boolean;
}

export type PackageCacheVerificationIssueKind =
  | "missing-provenance"
  | "invalid-provenance"
  | "archive-hash-mismatch"
  | "manifest-mismatch"
  | "package-hash-mismatch"
  | "invalid-archive";

export interface PackageCacheVerificationIssue {
  packageName: string;
  version: string;
  kind: PackageCacheVerificationIssueKind;
  message: string;
  path: string;
  provenancePath?: string;
}

export interface PackageCacheVerificationReport {
  schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  check: typeof CLI_JSON_CHECKS.packageCacheVerify;
  success: boolean;
  ok: boolean;
  entriesChecked: number;
  issues: PackageCacheVerificationIssue[];
}

export interface PackageCacheRepairResult {
  schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  check: typeof CLI_JSON_CHECKS.packageCacheRepair;
  success: boolean;
  dryRun: boolean;
  repaired: PackageCacheEntry[];
  unchanged: PackageCacheEntry[];
  issues: PackageCacheVerificationIssue[];
}

export interface PackageLockRepairResult {
  packages: number;
  updated: string[];
  removed: string[];
}

export type PackageProjectInstallAction =
  | "verified"
  | "repaired"
  | "restored"
  | "installed"
  | "noop";

export type PackageProjectInstallResult =
  | { action: "verified"; packagesChecked: number }
  | {
      action: "repaired";
      packages: number;
      updated: string[];
      removed: string[];
    }
  | { action: "restored" | "installed" | "noop"; packages: number };

/**
 * BPL Package Manager
 *
 * Handles packaging, installation, and dependency management for BPL projects.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CompilerError, type SourceLocation } from "../common/CompilerError";
import { getPositiveIntegerEnv, TIMEOUT_ENV_DEFAULTS } from "../common/Env";
import {
  CLI_JSON_CHECKS,
  CLI_JSON_SCHEMA_VERSION,
  createJsonReport,
} from "../common/JsonContracts";
import { compilerLog } from "../common/Logger";
import { findSymlinkedParentPath } from "../common/PathSafety";
import { formatSpawnFailureReason } from "../common/ProcessErrors";
import {
  resolvePackageImport,
  type PackageResolutionDetails,
} from "./PackageResolver";
import type { PackageOptionsGlobal, PackageOptionsVerbose } from "../../cli";

export function getPackageArchiveTool(): string {
  return process.env.BPL_TAR || process.env.TAR || "tar";
}

const PACKAGE_ARCHIVE_TOOL_TIMEOUT_MS =
  TIMEOUT_ENV_DEFAULTS.BPL_PACKAGE_TOOL_TIMEOUT_MS;

export function getPackageArchiveToolTimeoutMs(): number {
  return getPositiveIntegerEnv(
    "BPL_PACKAGE_TOOL_TIMEOUT_MS",
    PACKAGE_ARCHIVE_TOOL_TIMEOUT_MS,
    {
      warn: (message) => compilerLog.warn(message),
    },
  );
}

export const PACKAGE_INIT_NAME_INVALID_CODE =
  "BPL_PACKAGE_INIT_NAME_INVALID";
export const PACKAGE_INIT_MANIFEST_EXISTS_CODE =
  "BPL_PACKAGE_INIT_MANIFEST_EXISTS";
export const PACKAGE_INIT_JSON_ERROR_CODES = [
  PACKAGE_INIT_NAME_INVALID_CODE,
  PACKAGE_INIT_MANIFEST_EXISTS_CODE,
] as const;

export const PACKAGE_UNINSTALL_NAME_INVALID_CODE =
  "BPL_PACKAGE_UNINSTALL_NAME_INVALID";
export const PACKAGE_UNINSTALL_NOT_INSTALLED_CODE =
  "BPL_PACKAGE_UNINSTALL_NOT_INSTALLED";
export const PACKAGE_UNINSTALL_JSON_ERROR_CODES = [
  PACKAGE_UNINSTALL_NAME_INVALID_CODE,
  PACKAGE_UNINSTALL_NOT_INSTALLED_CODE,
] as const;

export const PACKAGE_CACHE_VERSION_INVALID_CODE =
  "BPL_PACKAGE_CACHE_VERSION_INVALID";
export const PACKAGE_CACHE_NAME_INVALID_CODE =
  "BPL_PACKAGE_CACHE_NAME_INVALID";
export const PACKAGE_CACHE_JSON_ERROR_CODES = [
  PACKAGE_CACHE_VERSION_INVALID_CODE,
  PACKAGE_CACHE_NAME_INVALID_CODE,
] as const;

export const PACKAGE_SEARCH_DIR_SYMLINK_CODE =
  "BPL_PACKAGE_SEARCH_DIR_SYMLINK";
export const PACKAGE_SEARCH_DIR_NOT_DIRECTORY_CODE =
  "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY";
export const PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY_CODE =
  "BPL_PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY";
export const PACKAGE_SEARCH_DIR_PARENT_SYMLINK_CODE =
  "BPL_PACKAGE_SEARCH_DIR_PARENT_SYMLINK";

export const PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE_CODE =
  "BPL_PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE";
export const PACKAGE_INSTALL_GLOBAL_PROJECT_CONFLICT_CODE =
  "BPL_PACKAGE_INSTALL_GLOBAL_PROJECT_CONFLICT";
export const PACKAGE_INSTALL_LOCKED_UPDATE_CONFLICT_CODE =
  "BPL_PACKAGE_INSTALL_LOCKED_UPDATE_CONFLICT";
export const PACKAGE_INSTALL_LOCKED_REPAIR_CONFLICT_CODE =
  "BPL_PACKAGE_INSTALL_LOCKED_REPAIR_CONFLICT";
export const PACKAGE_INSTALL_UPDATE_REPAIR_CONFLICT_CODE =
  "BPL_PACKAGE_INSTALL_UPDATE_REPAIR_CONFLICT";
export const PACKAGE_INSTALL_LOCK_VERIFY_FAILED_CODE =
  "BPL_PACKAGE_LOCK_VERIFY_FAILED";
export const PACKAGE_DUPLICATE_INSTALLED_CODE =
  "BPL_PACKAGE_DUPLICATE_INSTALLED";
export const PACKAGE_LIST_JSON_ERROR_CODES = [
  PACKAGE_SEARCH_DIR_SYMLINK_CODE,
  PACKAGE_SEARCH_DIR_NOT_DIRECTORY_CODE,
  PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY_CODE,
  PACKAGE_SEARCH_DIR_PARENT_SYMLINK_CODE,
  PACKAGE_DUPLICATE_INSTALLED_CODE,
] as const;
export const PACKAGE_INSTALL_JSON_ERROR_CODES = [
  PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE_CODE,
  PACKAGE_INSTALL_GLOBAL_PROJECT_CONFLICT_CODE,
  PACKAGE_INSTALL_LOCKED_UPDATE_CONFLICT_CODE,
  PACKAGE_INSTALL_LOCKED_REPAIR_CONFLICT_CODE,
  PACKAGE_INSTALL_UPDATE_REPAIR_CONFLICT_CODE,
  PACKAGE_INSTALL_LOCK_VERIFY_FAILED_CODE,
] as const;

export const PACKAGE_ARCHIVE_SYMLINK_CODE = "BPL_PACKAGE_ARCHIVE_SYMLINK";
export const PACKAGE_ARCHIVE_PARENT_SYMLINK_CODE =
  "BPL_PACKAGE_ARCHIVE_PARENT_SYMLINK";
export const PACKAGE_ARCHIVE_NOT_FILE_CODE =
  "BPL_PACKAGE_ARCHIVE_NOT_FILE";
export const PACKAGE_ARCHIVE_JSON_ERROR_CODES = [
  PACKAGE_ARCHIVE_SYMLINK_CODE,
  PACKAGE_ARCHIVE_PARENT_SYMLINK_CODE,
  PACKAGE_ARCHIVE_NOT_FILE_CODE,
] as const;

export const PACKAGE_MANIFEST_MISSING_CODE =
  "BPL_PACKAGE_MANIFEST_MISSING";
export const PACKAGE_MANIFEST_SYMLINK_CODE =
  "BPL_PACKAGE_MANIFEST_SYMLINK";
export const PACKAGE_MANIFEST_NOT_FILE_CODE =
  "BPL_PACKAGE_MANIFEST_NOT_FILE";
export const PACKAGE_MANIFEST_PARSE_ERROR_CODE =
  "BPL_PACKAGE_MANIFEST_PARSE_ERROR";
export const PACKAGE_MANIFEST_NOT_OBJECT_CODE =
  "BPL_PACKAGE_MANIFEST_NOT_OBJECT";
export const PACKAGE_MANIFEST_NAME_MISSING_CODE =
  "BPL_PACKAGE_MANIFEST_NAME_MISSING";
export const PACKAGE_MANIFEST_NAME_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_NAME_INVALID";
export const PACKAGE_MANIFEST_VERSION_MISSING_CODE =
  "BPL_PACKAGE_MANIFEST_VERSION_MISSING";
export const PACKAGE_MANIFEST_VERSION_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_VERSION_INVALID";
export const PACKAGE_MANIFEST_METADATA_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_METADATA_INVALID";
export const PACKAGE_MANIFEST_MAIN_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_MAIN_INVALID";
export const PACKAGE_MANIFEST_ENTRY_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_ENTRY_INVALID";
export const PACKAGE_MANIFEST_EXPORTS_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_EXPORTS_INVALID";
export const PACKAGE_MANIFEST_KEYWORDS_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_KEYWORDS_INVALID";
export const PACKAGE_MANIFEST_REPOSITORY_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_REPOSITORY_INVALID";
export const PACKAGE_MANIFEST_DEPENDENCIES_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_DEPENDENCIES_INVALID";
export const PACKAGE_MANIFEST_SCRIPTS_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_SCRIPTS_INVALID";
export const PACKAGE_MANIFEST_BIN_INVALID_CODE =
  "BPL_PACKAGE_MANIFEST_BIN_INVALID";
export const PACKAGE_MANIFEST_JSON_ERROR_CODES = [
  PACKAGE_MANIFEST_MISSING_CODE,
  PACKAGE_MANIFEST_SYMLINK_CODE,
  PACKAGE_MANIFEST_NOT_FILE_CODE,
  PACKAGE_MANIFEST_PARSE_ERROR_CODE,
  PACKAGE_MANIFEST_NOT_OBJECT_CODE,
  PACKAGE_MANIFEST_NAME_MISSING_CODE,
  PACKAGE_MANIFEST_NAME_INVALID_CODE,
  PACKAGE_MANIFEST_VERSION_MISSING_CODE,
  PACKAGE_MANIFEST_VERSION_INVALID_CODE,
  PACKAGE_MANIFEST_METADATA_INVALID_CODE,
  PACKAGE_MANIFEST_MAIN_INVALID_CODE,
  PACKAGE_MANIFEST_ENTRY_INVALID_CODE,
  PACKAGE_MANIFEST_EXPORTS_INVALID_CODE,
  PACKAGE_MANIFEST_KEYWORDS_INVALID_CODE,
  PACKAGE_MANIFEST_REPOSITORY_INVALID_CODE,
  PACKAGE_MANIFEST_DEPENDENCIES_INVALID_CODE,
  PACKAGE_MANIFEST_SCRIPTS_INVALID_CODE,
  PACKAGE_MANIFEST_BIN_INVALID_CODE,
] as const;

export interface PackageManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  main?: string;
  entry?: string;
  exports?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  bin?: Record<string, string>;
  repository?: {
    type: string;
    url: string;
  };
  keywords?: string[];
}

export interface PackageInfo {
  manifest: PackageManifest;
  path: string;
  hash: string;
}

export interface PackageUninstallResult {
  name: string;
  version: string;
  global: boolean;
}

export interface PackageInitResult {
  manifest: PackageManifest;
  manifestPath: string;
}

export interface PackageArchiveProvenance {
  schemaVersion: 1;
  name: string;
  version: string;
  archiveFile: string;
  archiveSha256: string;
  packageHash: string;
  sizeBytes: number;
  createdAt: string;
  manifest: PackageManifest;
}

export interface PackageLockFile {
  lockfileVersion: 1;
  packages: Record<
    string,
    {
      version: string;
      source: string;
      hash: string;
    }
  >;
}

export type PackageLockVerificationIssueKind =
  | "missing-lockfile"
  | "missing-package"
  | "invalid-package-root"
  | "invalid-manifest"
  | "name-mismatch"
  | "version-mismatch"
  | "hash-mismatch"
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

export type PackageDoctorIssueSeverity = "error" | "warning";

export interface PackageDoctorIssue {
  severity: PackageDoctorIssueSeverity;
  kind: string;
  code?: string;
  message: string;
  path?: string;
  paths?: string[];
  provenancePath?: string;
  hint?: string;
  packageName?: string;
  source?: string;
  expectedVersion?: string;
  actualVersion?: string;
  expectedName?: string;
  actualName?: string;
  expectedHash?: string;
  actualHash?: string;
  dependencyOf?: string;
  requestedSource?: string;
  lockVerificationKind?: PackageLockVerificationIssueKind;
}

export interface PackageDoctorReport {
  schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  check: typeof CLI_JSON_CHECKS.packages;
  success: boolean;
  ok: boolean;
  projectRoot: string;
  localPackageDir: string;
  globalPackageDir: string;
  manifest?: PackageManifest;
  lockfile: {
    path: string;
    exists: boolean;
    packages: number;
    verified: boolean;
  };
  installedPackages: PackageInfo[];
  cacheEntries: PackageCacheEntry[];
  cacheVerification: PackageCacheVerificationReport;
  dependencyTree: PackageDependencyTreeNode[];
  issues: PackageDoctorIssue[];
}

export interface PackageManagerOptions {
  ensureDirectories?: boolean;
  globalPackageDir?: string;
  globalBinDir?: string;
}

interface ResolvedDependencySource {
  packageSource: string;
  lockSource: string;
}

interface PackageInstallSourceContext {
  lockSource?: string;
}

export class PackageManager {
  private projectRoot: string;
  private globalPackageDir: string;
  private localPackageDir: string;
  private globalBinDir: string;
  private localBinDir: string;

  constructor(projectRoot?: string, options: PackageManagerOptions = {}) {
    // Global packages in ~/.bpl/packages
    this.globalPackageDir =
      options.globalPackageDir ?? path.join(os.homedir(), ".bpl", "packages");
    this.globalBinDir =
      options.globalBinDir ?? path.join(os.homedir(), ".bpl", "bin");

    // Local packages in project's node_modules equivalent
    const root = projectRoot || process.cwd();
    this.projectRoot = root;
    this.localPackageDir = path.join(root, "bpl_modules");
    this.localBinDir = path.join(this.localPackageDir, ".bin");

    if (options.ensureDirectories !== false) {
      this.ensureDirectories();
    }
  }

  /**
   * Ensure package directories exist
   */
  private ensureDirectories(): void {
    this.ensurePackageManagerDirectory(
      this.globalPackageDir,
      "Global package directory",
    );
    this.ensurePackageManagerDirectory(
      this.localPackageDir,
      "Local package directory",
    );
  }

  private ensurePackageManagerDirectory(dirPath: string, label: string): void {
    const existingPath = this.tryLstat(dirPath);
    if (existingPath) {
      this.assertPackageManagerDirectoryStats(existingPath, dirPath, label);
      return;
    }

    this.assertPackageManagerDirectoryParent(dirPath, label);
    fs.mkdirSync(dirPath, { recursive: true });
  }

  private readPackageManagerDirectoryStats(
    dirPath: string,
    label: string,
  ): fs.Stats | undefined {
    const existingPath = this.tryLstat(dirPath);
    if (!existingPath) return undefined;
    this.assertPackageManagerDirectoryStats(existingPath, dirPath, label);
    return existingPath;
  }

  private assertPackageManagerDirectoryStats(
    stats: fs.Stats,
    dirPath: string,
    label: string,
  ): void {
    if (stats.isSymbolicLink()) {
      throw new CompilerError(
        `${label} path is a symbolic link: ${dirPath}`,
        "Move the symlink out of the way or choose a real package root directory.",
        {
          file: dirPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_SEARCH_DIR_SYMLINK_CODE,
      );
    }

    if (!stats.isDirectory()) {
      throw new CompilerError(
        `${label} path is not a directory: ${dirPath}`,
        "Move the file out of the way or choose a different package root.",
        {
          file: dirPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_SEARCH_DIR_NOT_DIRECTORY_CODE,
      );
    }

    const symlinkedParent = findSymlinkedParentPath(dirPath);
    if (symlinkedParent) {
      this.throwPackageManagerDirectoryParentSymlink(label, symlinkedParent);
    }
  }

  private assertPackageManagerDirectoryParent(
    dirPath: string,
    label: string,
  ): void {
    for (
      let parentPath = path.dirname(path.resolve(dirPath));
      ;
      parentPath = path.dirname(parentPath)
    ) {
      const existingPath = this.tryLstat(parentPath);
      if (existingPath) {
        if (existingPath.isSymbolicLink()) {
          this.throwPackageManagerDirectoryParentSymlink(label, parentPath);
        }

        if (!existingPath.isDirectory()) {
          throw new CompilerError(
            `${label} parent path is not a directory: ${parentPath}`,
            "Move the file out of the way or choose a different package root.",
            {
              file: parentPath,
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
            PACKAGE_SEARCH_DIR_PARENT_NOT_DIRECTORY_CODE,
          );
        }
        return;
      }

      const nextParent = path.dirname(parentPath);
      if (nextParent === parentPath) return;
    }
  }

  private throwPackageManagerDirectoryParentSymlink(
    label: string,
    parentPath: string,
  ): never {
    throw new CompilerError(
      `${label} parent path is a symbolic link: ${parentPath}`,
      "Move the symlink out of the way or choose a real package root directory.",
      {
        file: parentPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
      PACKAGE_SEARCH_DIR_PARENT_SYMLINK_CODE,
    );
  }

  private linkBinaries(
    manifest: PackageManifest,
    installPath: string,
    isGlobal: boolean,
  ): void {
    if (!manifest.bin) return;

    const binDir = isGlobal ? this.globalBinDir : this.localBinDir;
    this.ensurePackageManagerDirectory(
      binDir,
      isGlobal ? "Global binary directory" : "Local binary directory",
    );

    for (const [name, relativePath] of Object.entries(manifest.bin)) {
      if (
        !this.isSafeBinCommandName(name) ||
        !this.isSafePackageRelativePath(relativePath)
      ) {
        throw new CompilerError(
          "Invalid 'bin' field",
          "'bin' entries must use safe command names and package-relative executable paths.",
          {
            file: path.join(installPath, "bpl.json"),
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      const manifestPath = path.join(installPath, "bpl.json");
      const sourcePath = this.validatePackageBinFile(
        installPath,
        relativePath,
        manifestPath,
      );
      const targetPath = path.join(binDir, name);

      this.assertPackageBinaryTargetReplaceable(
        targetPath,
        name,
        manifestPath,
      );

      // Ensure source is executable
      if (process.platform !== "win32") {
        try {
          fs.chmodSync(sourcePath, "755");
        } catch {
          // Permission errors can occur on read-only filesystems or when lacking privileges
          // This is non-critical as the file may already be executable
        }
      }

      // Create symlink
      try {
        this.linkPackageBinaryAtomically(
          sourcePath,
          targetPath,
          name,
          manifestPath,
        );
      } catch (e) {
        compilerLog.warn(
          `Failed to link binary ${name}: ${(e as Error).message}`,
        );
      }
    }
  }

  private linkPackageBinaryAtomically(
    sourcePath: string,
    targetPath: string,
    commandName: string,
    manifestPath: string,
  ): void {
    for (let attempt = 0; attempt < 10; attempt++) {
      const tempPath = this.getAtomicWriteTempPath(targetPath, attempt);
      if (this.tryLstat(tempPath)) {
        continue;
      }

      let createdTemp = false;
      try {
        fs.symlinkSync(sourcePath, tempPath);
        createdTemp = true;

        const existingTarget = this.tryLstat(targetPath);
        this.assertPackageBinaryTargetReplaceable(
          targetPath,
          commandName,
          manifestPath,
          existingTarget,
        );

        fs.renameSync(tempPath, targetPath);
        return;
      } catch (error) {
        if (this.isNodeErrorCode(error, "EEXIST")) {
          continue;
        }
        this.removeBestEffort(tempPath);
        throw error;
      } finally {
        if (createdTemp) {
          this.removeBestEffort(tempPath);
        }
      }
    }

    throw new CompilerError(
      `Failed to create temporary binary link for '${commandName}'`,
      "Remove stale temporary package binary links and retry.",
      {
        file: manifestPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private assertPackageBinaryTargetsWritable(
    manifest: PackageManifest,
    packageDir: string,
    isGlobal: boolean,
  ): void {
    if (!manifest.bin) return;

    const binDir = isGlobal ? this.globalBinDir : this.localBinDir;
    this.ensurePackageManagerDirectory(
      binDir,
      isGlobal ? "Global binary directory" : "Local binary directory",
    );
    const manifestPath = path.join(packageDir, "bpl.json");

    for (const [name, relativePath] of Object.entries(manifest.bin)) {
      if (
        !this.isSafeBinCommandName(name) ||
        !this.isSafePackageRelativePath(relativePath)
      ) {
        throw new CompilerError(
          "Invalid 'bin' field",
          "'bin' entries must use safe command names and package-relative executable paths.",
          {
            file: manifestPath,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      this.validatePackageBinFile(packageDir, relativePath, manifestPath);
      const targetPath = path.join(binDir, name);
      const existingTarget = this.tryLstat(targetPath);
      this.assertPackageBinaryTargetReplaceable(
        targetPath,
        name,
        manifestPath,
        existingTarget,
      );
    }
  }

  private assertPackageBinaryTargetReplaceable(
    targetPath: string,
    commandName: string,
    manifestPath: string,
    existingTarget = this.tryLstat(targetPath),
  ): void {
    if (!existingTarget || existingTarget.isSymbolicLink()) {
      return;
    }

    const existingKind = existingTarget.isDirectory()
      ? "A directory"
      : "A non-symlink file";
    throw new CompilerError(
      `Cannot link package binary '${commandName}'`,
      `${existingKind} already exists at ${targetPath}. Move it out of the way and try again.`,
      {
        file: manifestPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private getLockFilePath(): string {
    return path.join(this.projectRoot, "bpl.lock");
  }

  loadLockFile(): PackageLockFile {
    const lockPath = this.getLockFilePath();
    const location: SourceLocation = {
      file: lockPath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    };

    if (!this.assertReadableLockFilePath(lockPath, location)) {
      return { lockfileVersion: 1, packages: {} };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    } catch (error) {
      throw new CompilerError(
        `Failed to load package lockfile: ${error instanceof Error ? error.message : String(error)}`,
        "Check that bpl.lock is valid JSON or regenerate it with 'bpl install'.",
        location,
        "BPL_LOCKFILE_INVALID_JSON",
      );
    }

    this.validateLockFileShape(parsed, location);

    return {
      lockfileVersion: 1,
      packages: parsed.packages || {},
    };
  }

  private assertReadableLockFilePath(
    lockPath: string,
    location: SourceLocation,
  ): boolean {
    const existingLock = this.tryLstat(lockPath);
    if (!existingLock) return false;

    if (existingLock.isSymbolicLink()) {
      throw new CompilerError(
        "Invalid bpl.lock path: symbolic link",
        "bpl.lock must be a regular file, not a symbolic link.",
        location,
        "BPL_LOCKFILE_SYMLINK",
      );
    }

    if (!existingLock.isFile()) {
      throw new CompilerError(
        "Invalid bpl.lock path",
        "bpl.lock must be a regular file.",
        location,
        "BPL_LOCKFILE_NOT_FILE",
      );
    }

    return true;
  }

  private validateLockFileShape(
    lock: unknown,
    location: SourceLocation,
  ): asserts lock is PackageLockFile {
    if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
      throw new CompilerError(
        "Invalid bpl.lock",
        "bpl.lock must be a JSON object.",
        location,
        "BPL_LOCKFILE_INVALID_SHAPE",
      );
    }

    const rawLock = lock as {
      lockfileVersion?: unknown;
      packages?: unknown;
    };

    if (
      rawLock.lockfileVersion !== undefined &&
      rawLock.lockfileVersion !== 1
    ) {
      throw new CompilerError(
        "Invalid bpl.lock",
        "Only lockfileVersion 1 is supported.",
        location,
        "BPL_LOCKFILE_UNSUPPORTED_VERSION",
      );
    }

    if (
      rawLock.packages !== undefined &&
      (typeof rawLock.packages !== "object" ||
        rawLock.packages === null ||
        Array.isArray(rawLock.packages))
    ) {
      throw new CompilerError(
        "Invalid bpl.lock",
        "'packages' must be an object mapping package names to lock entries.",
        location,
        "BPL_LOCKFILE_INVALID_PACKAGES",
      );
    }

    const packages = (rawLock.packages || {}) as Record<string, unknown>;
    for (const [packageName, entry] of Object.entries(packages)) {
      if (!/^[a-z0-9-]+$/.test(packageName)) {
        throw new CompilerError(
          `Invalid bpl.lock entry: ${packageName}`,
          "Package lock entry names must use lowercase letters, digits, and hyphens only.",
          location,
          "BPL_LOCKFILE_INVALID_ENTRY_NAME",
        );
      }

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new CompilerError(
          `Invalid bpl.lock entry for ${packageName}`,
          "Each package lock entry must be an object.",
          location,
          "BPL_LOCKFILE_INVALID_ENTRY",
        );
      }

      const rawEntry = entry as {
        version?: unknown;
        source?: unknown;
        hash?: unknown;
      };

      if (
        typeof rawEntry.version !== "string" ||
        !/^\d+\.\d+\.\d+$/.test(rawEntry.version)
      ) {
        throw new CompilerError(
          `Invalid bpl.lock version for ${packageName}`,
          "Lock entry versions must use X.Y.Z semantic version format.",
          location,
          "BPL_LOCKFILE_INVALID_ENTRY_VERSION",
        );
      }

      if (typeof rawEntry.source !== "string" || rawEntry.source.length === 0) {
        throw new CompilerError(
          `Invalid bpl.lock source for ${packageName}`,
          "Lock entry sources must be non-empty strings.",
          location,
          "BPL_LOCKFILE_INVALID_ENTRY_SOURCE",
        );
      }

      if (typeof rawEntry.hash !== "string" || rawEntry.hash.length === 0) {
        throw new CompilerError(
          `Invalid bpl.lock hash for ${packageName}`,
          "Lock entry hashes must be non-empty strings.",
          location,
          "BPL_LOCKFILE_INVALID_ENTRY_HASH",
        );
      }
    }
  }

  private saveLockFile(lock: PackageLockFile): void {
    const lockPath = this.getLockFilePath();
    const existingLock = this.tryLstat(lockPath);
    if (existingLock?.isSymbolicLink()) {
      throw new CompilerError(
        "Invalid bpl.lock path: symbolic link",
        "bpl.lock must be a regular file, not a symbolic link.",
        {
          file: lockPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        "BPL_LOCKFILE_SYMLINK",
      );
    }

    if (existingLock && !existingLock.isFile()) {
      throw new CompilerError(
        "Invalid bpl.lock path",
        "bpl.lock must be a regular file.",
        {
          file: lockPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        "BPL_LOCKFILE_NOT_FILE",
      );
    }

    this.writeFileAtomically(lockPath, JSON.stringify(lock, null, 2));
  }

  private writeFileAtomically(filePath: string, content: string): void {
    const existingFile = this.tryLstat(filePath);
    const mode =
      existingFile && existingFile.isFile()
        ? existingFile.mode & 0o777
        : undefined;

    for (let attempt = 0; attempt < 10; attempt++) {
      const tempPath = this.getAtomicWriteTempPath(filePath, attempt);
      let createdTemp = false;

      try {
        fs.writeFileSync(tempPath, content, {
          flag: "wx",
          ...(mode === undefined ? {} : { mode }),
        });
        createdTemp = true;
        if (mode !== undefined) {
          fs.chmodSync(tempPath, mode);
        }
        fs.renameSync(tempPath, filePath);
        return;
      } catch (error) {
        if (this.isNodeErrorCode(error, "EEXIST")) {
          continue;
        }
        this.removeBestEffort(tempPath);
        throw error;
      } finally {
        if (createdTemp) {
          this.removeBestEffort(tempPath);
        }
      }
    }

    throw new Error(`Failed to create temporary output file for ${filePath}`);
  }

  private copyFileAtomically(sourcePath: string, destinationPath: string): void {
    const existingFile = this.tryLstat(destinationPath);
    const mode =
      existingFile && existingFile.isFile()
        ? existingFile.mode & 0o777
        : undefined;

    for (let attempt = 0; attempt < 10; attempt++) {
      const tempPath = this.getAtomicWriteTempPath(destinationPath, attempt);
      let createdTemp = false;

      try {
        fs.copyFileSync(sourcePath, tempPath, fs.constants.COPYFILE_EXCL);
        createdTemp = true;
        if (mode !== undefined) {
          fs.chmodSync(tempPath, mode);
        }
        fs.renameSync(tempPath, destinationPath);
        return;
      } catch (error) {
        if (this.isNodeErrorCode(error, "EEXIST")) {
          continue;
        }
        this.removeBestEffort(tempPath);
        throw error;
      } finally {
        if (createdTemp) {
          this.removeBestEffort(tempPath);
        }
      }
    }

    throw new Error(
      `Failed to create temporary copy file for ${destinationPath}`,
    );
  }

  private getAtomicWriteTempPath(filePath: string, attempt: number): string {
    return path.join(
      path.dirname(path.resolve(filePath)),
      `.${path.basename(filePath)}.${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}-${attempt}.tmp`,
    );
  }

  private removeBestEffort(filePath: string): void {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private recordLocalInstall(
    manifest: PackageManifest,
    installPath: string,
    source: string,
    existingLock?: PackageLockFile,
  ): void {
    const lock = existingLock ?? this.loadLockFile();
    lock.packages[manifest.name] = {
      version: manifest.version,
      source,
      hash: this.calculatePackageHash(installPath),
    };
    this.saveLockFile(lock);
  }

  verifyLockFile(): PackageLockVerification {
    const lockPath = this.getLockFilePath();
    if (!this.tryLstat(lockPath)) {
      const issues: PackageLockVerificationIssue[] = [
        {
          packageName: path.basename(this.projectRoot) || this.projectRoot,
          kind: "missing-lockfile",
          message: `No bpl.lock found in ${this.projectRoot}`,
          packagePath: lockPath,
        },
      ];
      return {
        ok: false,
        errors: issues.map((issue) => issue.message),
        issues,
        packagesChecked: 0,
      };
    }

    const lock = this.loadLockFile();
    const issues: PackageLockVerificationIssue[] = [];
    const addIssue = (issue: PackageLockVerificationIssue) => {
      issues.push(issue);
    };
    let packagesChecked = 0;
    const lockEntries = Object.entries(lock.packages);

    if (lockEntries.length > 0) {
      this.readPackageManagerDirectoryStats(
        this.localPackageDir,
        "Local package directory",
      );
    }

    for (const [packageName, entry] of lockEntries) {
      packagesChecked++;
      const installPath = path.join(this.localPackageDir, packageName);

      const packageRootStats = this.tryLstat(installPath);
      if (!packageRootStats) {
        addIssue({
          packageName,
          kind: "missing-package",
          message: `${packageName}: missing from bpl_modules (expected ${entry.version} from ${entry.source})`,
          packagePath: installPath,
          source: entry.source,
          expectedVersion: entry.version,
          expectedHash: entry.hash,
        });
        continue;
      }

      if (packageRootStats.isSymbolicLink()) {
        addIssue({
          packageName,
          kind: "invalid-package-root",
          message: `${packageName}: installed package root is a symbolic link (${installPath})`,
          packagePath: installPath,
          source: entry.source,
          expectedVersion: entry.version,
          expectedHash: entry.hash,
        });
        continue;
      }

      if (!packageRootStats.isDirectory()) {
        addIssue({
          packageName,
          kind: "invalid-package-root",
          message: `${packageName}: installed package root is not a directory (${installPath})`,
          packagePath: installPath,
          source: entry.source,
          expectedVersion: entry.version,
          expectedHash: entry.hash,
        });
        continue;
      }

      let manifest: PackageManifest;
      try {
        manifest = this.loadManifest(installPath);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        addIssue({
          packageName,
          kind: "invalid-manifest",
          message: `${packageName}: invalid installed package (${detail})`,
          packagePath: installPath,
          source: entry.source,
          expectedVersion: entry.version,
        });
        continue;
      }

      if (manifest.name !== packageName) {
        addIssue({
          packageName,
          kind: "name-mismatch",
          message: `${packageName}: manifest name mismatch, lock entry is ${packageName} but installed package declares ${manifest.name}`,
          packagePath: installPath,
          source: entry.source,
          expectedName: packageName,
          actualName: manifest.name,
          expectedVersion: entry.version,
          actualVersion: manifest.version,
        });
      }

      if (manifest.version !== entry.version) {
        addIssue({
          packageName,
          kind: "version-mismatch",
          message: `${packageName}: version mismatch, lock has ${entry.version} but installed package has ${manifest.version}`,
          packagePath: installPath,
          source: entry.source,
          expectedVersion: entry.version,
          actualVersion: manifest.version,
        });
      }

      const actualHash = this.calculatePackageHash(installPath);
      if (actualHash !== entry.hash) {
        addIssue({
          packageName,
          kind: "hash-mismatch",
          message: `${packageName}: hash mismatch, lock has ${entry.hash} but installed package has ${actualHash}`,
          packagePath: installPath,
          source: entry.source,
          expectedVersion: entry.version,
          expectedHash: entry.hash,
          actualHash,
        });
      }

      if (!this.lockSourceExists(packageName, entry.source)) {
        addIssue({
          packageName,
          kind: "unreachable-source",
          message: `${packageName}: lock source is not reachable (${entry.source})`,
          packagePath: installPath,
          source: entry.source,
          expectedVersion: entry.version,
          expectedHash: entry.hash,
        });
      }

      for (const [dependencyName, requestedSource] of Object.entries(
        manifest.dependencies || {},
      )) {
        const dependencyPath = path.join(this.localPackageDir, dependencyName);
        const dependencyStats = this.tryLstat(dependencyPath);
        if (
          dependencyStats &&
          !dependencyStats.isSymbolicLink() &&
          dependencyStats.isDirectory()
        ) {
          if (!lock.packages[dependencyName]) {
            addIssue({
              packageName: dependencyName,
              kind: "missing-transitive-lock-entry",
              message: `${packageName}: dependency '${dependencyName}' is installed but missing from bpl.lock (requested ${requestedSource})`,
              packagePath: dependencyPath,
              dependencyOf: packageName,
              requestedSource,
            });
          }
          continue;
        }

        if (dependencyStats) {
          addIssue({
            packageName: dependencyName,
            kind: "invalid-package-root",
            message: `${packageName}: dependency '${dependencyName}' has an invalid package root in bpl_modules`,
            packagePath: dependencyPath,
            source: lock.packages[dependencyName]?.source,
            expectedVersion: lock.packages[dependencyName]?.version,
            expectedHash: lock.packages[dependencyName]?.hash,
            dependencyOf: packageName,
            requestedSource,
          });
          continue;
        }

        addIssue({
          packageName: dependencyName,
          kind: "missing-transitive-dependency",
          message: `${packageName}: dependency '${dependencyName}' is missing from bpl_modules (requested ${requestedSource})`,
          packagePath: dependencyPath,
          source: lock.packages[dependencyName]?.source,
          expectedVersion: lock.packages[dependencyName]?.version,
          expectedHash: lock.packages[dependencyName]?.hash,
          dependencyOf: packageName,
          requestedSource,
        });
      }
    }

    const errors = issues.map((issue) => issue.message);
    return {
      ok: issues.length === 0,
      errors,
      issues,
      packagesChecked,
    };
  }

  installProject(
    options: PackageOptionsVerbose = { verbose: false, global: false },
  ): PackageProjectInstallResult {
    if (options.global) {
      throw new CompilerError(
        "Project dependency install cannot be global",
        "Run 'bpl install <package> --global' for a single global package.",
        {
          file: this.projectRoot,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_INSTALL_GLOBAL_PROJECT_CONFLICT_CODE,
      );
    }

    if (options.locked && options.update) {
      throw new CompilerError(
        "Cannot use --locked with --update",
        "--locked verifies the existing lockfile; --update rewrites it.",
        {
          file: this.getLockFilePath(),
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_INSTALL_LOCKED_UPDATE_CONFLICT_CODE,
      );
    }

    if (options.locked && options.repairLock) {
      throw new CompilerError(
        "Cannot use --locked with --repair-lock",
        "--locked verifies the existing lockfile; --repair-lock rewrites it.",
        {
          file: this.getLockFilePath(),
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_INSTALL_LOCKED_REPAIR_CONFLICT_CODE,
      );
    }

    if (options.update && options.repairLock) {
      throw new CompilerError(
        "Cannot use --update with --repair-lock",
        "--update resolves bpl.json dependencies; --repair-lock records currently installed packages.",
        {
          file: this.getLockFilePath(),
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_INSTALL_UPDATE_REPAIR_CONFLICT_CODE,
      );
    }

    if (options.locked) {
      const verification = this.verifyLockFile();
      if (!verification.ok) {
        throw new PackageLockVerificationError(
          verification,
          this.getLockFilePath(),
          this.formatLockVerificationHelp(verification),
        );
      }

      compilerLog.info(
        `✓ Lockfile verified (${verification.packagesChecked} package${verification.packagesChecked === 1 ? "" : "s"})`,
      );
      return {
        action: "verified",
        packagesChecked: verification.packagesChecked,
      };
    }

    if (options.repairLock) {
      const result = this.repairLockFile();
      compilerLog.info(
        `✓ Repaired bpl.lock (${result.packages} package${result.packages === 1 ? "" : "s"})`,
      );
      if (result.updated.length > 0 && options.verbose) {
        compilerLog.info(`Updated: ${result.updated.join(", ")}`);
      }
      if (result.removed.length > 0 && options.verbose) {
        compilerLog.info(`Removed stale entries: ${result.removed.join(", ")}`);
      }
      return {
        action: "repaired",
        packages: result.packages,
        updated: result.updated,
        removed: result.removed,
      };
    }

    const lockPath = this.getLockFilePath();
    if (this.tryLstat(lockPath) && !options.update) {
      const lock = this.loadLockFile();
      const entries = Object.entries(lock.packages);
      if (entries.length > 0) {
        compilerLog.info(`Restoring ${entries.length} locked packages...`);
        for (const [packageName, entry] of entries) {
          if (options.verbose) {
            compilerLog.info(
              `Restoring ${packageName}@${entry.version} from ${entry.source}`,
            );
          }
          const resolved = this.resolveDependencySource(
            packageName,
            entry.source,
            this.projectRoot,
          );
          this.install(
            resolved.packageSource,
            {
              ...options,
              global: false,
              locked: false,
            },
            [],
            packageName,
            { lockSource: resolved.lockSource },
          );
        }
        return { action: "restored", packages: entries.length };
      }
    }

    const manifest = this.loadManifest(this.projectRoot);
    const deps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    if (options.update) {
      this.saveLockFile({ lockfileVersion: 1, packages: {} });
    }

    if (Object.keys(deps).length === 0) {
      compilerLog.info("No dependencies to install");
      return { action: "noop", packages: 0 };
    }

    const dependencyEntries = Object.entries(deps);
    compilerLog.info(`Installing ${dependencyEntries.length} dependencies...`);
    for (const [name, source] of dependencyEntries) {
      const resolved = this.resolveDependencySource(
        name,
        source,
        this.projectRoot,
      );
      this.install(
        resolved.packageSource,
        {
          ...options,
          global: false,
        },
        [],
        name,
        { lockSource: resolved.lockSource },
      );
    }
    return { action: "installed", packages: dependencyEntries.length };
  }

  private formatLockVerificationHelp(
    verification: PackageLockVerification,
  ): string {
    const issueKinds = new Set(verification.issues.map((issue) => issue.kind));

    if (issueKinds.has("missing-lockfile")) {
      return "Run 'bpl install' to create bpl.lock from bpl.json dependencies.";
    }

    const restoreHelp = "Run 'bpl install' to restore packages from bpl.lock.";
    if (
      issueKinds.has("missing-package") ||
      issueKinds.has("missing-transitive-lock-entry") ||
      issueKinds.has("missing-transitive-dependency")
    ) {
      return `${restoreHelp} Run 'bpl list --tree' to inspect dependency state.`;
    }

    if (issueKinds.has("name-mismatch")) {
      return `${restoreHelp} Reinstall the package so bpl_modules directory names and bpl.lock entries match manifest names.`;
    }

    if (issueKinds.has("invalid-package-root")) {
      return `${restoreHelp} Move unexpected files or symlinks out of bpl_modules and reinstall the package.`;
    }

    if (
      issueKinds.has("hash-mismatch") ||
      issueKinds.has("version-mismatch") ||
      issueKinds.has("unreachable-source")
    ) {
      return `${restoreHelp} If the changed package is intentional, reinstall the intended source to update bpl.lock.`;
    }

    return restoreHelp;
  }

  private resolveDependencySource(
    packageName: string,
    source: string,
    baseDir: string = this.projectRoot,
  ): ResolvedDependencySource {
    const fileSource = source.startsWith("file:") ? source.slice(5) : source;
    const baseRelativePath = this.resolveDependencyFileSource(
      baseDir,
      fileSource,
    );

    if (this.isPackageFileSource(fileSource)) {
      const baseRelativePathExists = Boolean(this.tryLstat(baseRelativePath));
      const packageSource = baseRelativePathExists
        ? baseRelativePath
        : fileSource;
      const lockSource = baseRelativePathExists
        ? this.formatFileLockSource(baseRelativePath)
        : source;

      return { packageSource, lockSource };
    }

    if (isVersionSelectorSpec(fileSource)) {
      const packageSource = this.resolveGlobalPackageVersionSource(
        packageName,
        fileSource,
      );
      return {
        packageSource,
        lockSource: path.basename(packageSource),
      };
    }

    return { packageSource: packageName, lockSource: packageName };
  }

  private formatFileLockSource(filePath: string): string {
    const relativePath = path
      .relative(this.projectRoot, filePath)
      .split(path.sep)
      .join("/");
    return `file:${relativePath || path.basename(filePath)}`;
  }

  private isPackageFileSource(fileSource: string): boolean {
    return (
      fileSource.endsWith(".tgz") ||
      fileSource.startsWith(".") ||
      path.isAbsolute(fileSource) ||
      path.win32.isAbsolute(fileSource) ||
      fileSource.includes("/") ||
      fileSource.includes("\\")
    );
  }

  private resolveDependencyFileSource(baseDir: string, fileSource: string): string {
    if (path.isAbsolute(fileSource) || path.win32.isAbsolute(fileSource)) {
      return fileSource;
    }

    return path.resolve(baseDir, ...fileSource.split(/[\\/]/));
  }

  private resolveRelativePackageSource(baseDir: string, fileSource: string): string {
    return path.join(baseDir, ...fileSource.split(/[\\/]/));
  }

  private getPackageSourceBasename(fileSource: string): string {
    const parts = fileSource.split(/[\\/]/);
    return parts[parts.length - 1] || path.basename(fileSource);
  }

  private stripPackageFileSourcePrefix(packageSource: string): string {
    return packageSource.startsWith("file:")
      ? packageSource.slice("file:".length)
      : packageSource;
  }

  private formatDirectPackageFileLockSource(packageSource: string): string {
    const hasFilePrefix = packageSource.startsWith("file:");
    const fileSource = this.stripPackageFileSourcePrefix(packageSource);
    const normalizedSource =
      path.isAbsolute(fileSource) || path.win32.isAbsolute(fileSource)
        ? fileSource
        : fileSource.split(/[\\/]/).join("/");

    if (hasFilePrefix) {
      return `file:${normalizedSource}`;
    }

    return normalizedSource;
  }

  private lockSourceExists(packageName: string, source: string): boolean {
    return this.getLockSourceCandidates(packageName, source).some((candidate) =>
      this.isReachableLockSource(candidate),
    );
  }

  private isReachableLockSource(candidate: string): boolean {
    if (findSymlinkedParentPath(candidate)) return false;
    const stats = this.tryLstat(candidate);
    return Boolean(stats && !stats.isSymbolicLink() && stats.isFile());
  }

  private getLockSourceCandidates(packageName: string, source: string): string[] {
    const fileSource = source.startsWith("file:") ? source.slice(5) : source;
    const candidates = new Set<string>();

    if (path.isAbsolute(fileSource)) {
      candidates.add(fileSource);
    } else {
      candidates.add(this.resolveDependencyFileSource(this.projectRoot, fileSource));
      candidates.add(
        this.resolveRelativePackageSource(this.globalPackageDir, fileSource),
      );
    }

    if (/^\d+\.\d+\.\d+$/.test(fileSource)) {
      candidates.add(
        path.join(this.globalPackageDir, `${packageName}-${fileSource}.tgz`),
      );
    }

    if (fileSource.endsWith(".tgz")) {
      candidates.add(
        path.join(this.globalPackageDir, this.getPackageSourceBasename(fileSource)),
      );
    }

    return [...candidates];
  }

  private removeLocalLockEntry(
    packageName: string,
    existingLock?: PackageLockFile,
  ): void {
    const lockPath = this.getLockFilePath();
    if (!existingLock && !this.tryLstat(lockPath)) return;

    const lock = existingLock ?? this.loadLockFile();
    delete lock.packages[packageName];
    this.saveLockFile(lock);
  }

  /**
   * Load package manifest from directory
   */
  loadManifest(packageDir: string): PackageManifest {
    const manifestPath = path.join(packageDir, "bpl.json");
    const location: SourceLocation = {
      file: manifestPath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    };

    const manifestStats = this.tryLstat(manifestPath);
    if (!manifestStats) {
      throw new CompilerError(
        `No bpl.json found in ${packageDir}`,
        "Run 'bpl init' to create a new package.",
        location,
        PACKAGE_MANIFEST_MISSING_CODE,
      );
    }

    try {
      if (manifestStats.isSymbolicLink()) {
        throw new CompilerError(
          "Invalid package manifest path: symbolic link",
          "bpl.json must be a regular file, not a symbolic link.",
          location,
          PACKAGE_MANIFEST_SYMLINK_CODE,
        );
      }

      if (!manifestStats.isFile()) {
        throw new CompilerError(
          "Invalid package manifest path",
          "bpl.json must be a regular file.",
          location,
          PACKAGE_MANIFEST_NOT_FILE_CODE,
        );
      }

      const content = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as PackageManifest;

      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new CompilerError(
          "Invalid package manifest",
          "bpl.json must contain a JSON object.",
          location,
          PACKAGE_MANIFEST_NOT_OBJECT_CODE,
        );
      }

      // Validate required fields
      if (!manifest.name) {
        throw new CompilerError(
          "Package manifest missing 'name' field",
          "Add a 'name' field to bpl.json.",
          location,
          PACKAGE_MANIFEST_NAME_MISSING_CODE,
        );
      }
      if (typeof manifest.name !== "string") {
        throw new CompilerError(
          "Invalid package manifest 'name' field",
          "'name' must be a non-empty string.",
          location,
          PACKAGE_MANIFEST_NAME_INVALID_CODE,
        );
      }
      if (!manifest.version) {
        throw new CompilerError(
          "Package manifest missing 'version' field",
          "Add a 'version' field to bpl.json (e.g., '0.1.0').",
          location,
          PACKAGE_MANIFEST_VERSION_MISSING_CODE,
        );
      }
      if (typeof manifest.version !== "string") {
        throw new CompilerError(
          "Invalid package manifest 'version' field",
          "'version' must be a semantic version string.",
          location,
          PACKAGE_MANIFEST_VERSION_INVALID_CODE,
        );
      }

      // Validate version format
      if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        throw new CompilerError(
          `Invalid version format: ${manifest.version} (expected: X.Y.Z)`,
          "Version must be in semantic versioning format (Major.Minor.Patch).",
          location,
          PACKAGE_MANIFEST_VERSION_INVALID_CODE,
        );
      }

      validatePackageName(
        manifest.name,
        location,
        PACKAGE_MANIFEST_NAME_INVALID_CODE,
      );

      // Validate dependencies, scripts, and bin
      this.validateManifestMetadataFields(manifest, location);
      this.validateManifestDependencyEntries(manifest, location);
      if (
        manifest.scripts &&
        (typeof manifest.scripts !== "object" ||
          Array.isArray(manifest.scripts))
      ) {
        throw new CompilerError(
          "Invalid 'scripts' field",
          "'scripts' must be an object mapping script names to commands.",
          location,
          PACKAGE_MANIFEST_SCRIPTS_INVALID_CODE,
        );
      }
      this.validateManifestScriptEntries(manifest, location);
      if (
        manifest.bin &&
        (typeof manifest.bin !== "object" || Array.isArray(manifest.bin))
      ) {
        throw new CompilerError(
          "Invalid 'bin' field",
          "'bin' must be an object mapping command names to executable paths.",
          location,
          PACKAGE_MANIFEST_BIN_INVALID_CODE,
        );
      }
      this.validateManifestBinEntries(manifest, packageDir, location);

      return manifest;
    } catch (e) {
      if (e instanceof CompilerError) throw e;
      throw new CompilerError(
        `Failed to load package manifest: ${e instanceof Error ? e.message : String(e)}`,
        "Check that bpl.json is valid JSON.",
        location,
        PACKAGE_MANIFEST_PARSE_ERROR_CODE,
      );
    }
  }

  private validateManifestMetadataFields(
    manifest: PackageManifest,
    location: SourceLocation,
  ): void {
    for (const field of ["description", "author", "license"] as const) {
      if (manifest[field] !== undefined && typeof manifest[field] !== "string") {
        throw new CompilerError(
          `Invalid package manifest '${field}' field`,
          `'${field}' must be a string when present.`,
          location,
          PACKAGE_MANIFEST_METADATA_INVALID_CODE,
        );
      }
    }

    if (manifest.main !== undefined) {
      if (
        typeof manifest.main !== "string" ||
        !this.isSafeManifestRelativePath(manifest.main)
      ) {
        throw new CompilerError(
          "Invalid package manifest 'main' field",
          "'main' must be a package-relative path without empty, '.', or '..' segments.",
          location,
          PACKAGE_MANIFEST_MAIN_INVALID_CODE,
        );
      }
    }

    if (manifest.entry !== undefined) {
      if (
        typeof manifest.entry !== "string" ||
        !this.isSafeManifestRelativePath(manifest.entry)
      ) {
        throw new CompilerError(
          "Invalid package manifest 'entry' field",
          "'entry' must be a package-relative path without empty, '.', or '..' segments.",
          location,
          PACKAGE_MANIFEST_ENTRY_INVALID_CODE,
        );
      }
    }

    if (manifest.exports !== undefined) {
      if (
        !Array.isArray(manifest.exports) ||
        manifest.exports.some(
          (entry) =>
            typeof entry !== "string" ||
            !this.isSafeManifestRelativePath(entry),
        )
      ) {
        throw new CompilerError(
          "Invalid package manifest 'exports' field",
          "'exports' must be an array of package-relative paths without empty, '.', or '..' segments.",
          location,
          PACKAGE_MANIFEST_EXPORTS_INVALID_CODE,
        );
      }
    }

    if (manifest.keywords !== undefined) {
      if (
        !Array.isArray(manifest.keywords) ||
        manifest.keywords.some((keyword) => typeof keyword !== "string")
      ) {
        throw new CompilerError(
          "Invalid package manifest 'keywords' field",
          "'keywords' must be an array of strings.",
          location,
          PACKAGE_MANIFEST_KEYWORDS_INVALID_CODE,
        );
      }
    }

    if (manifest.repository !== undefined) {
      if (
        !manifest.repository ||
        typeof manifest.repository !== "object" ||
        Array.isArray(manifest.repository) ||
        typeof manifest.repository.type !== "string" ||
        typeof manifest.repository.url !== "string"
      ) {
        throw new CompilerError(
          "Invalid package manifest 'repository' field",
          "'repository' must contain string 'type' and 'url' fields.",
          location,
          PACKAGE_MANIFEST_REPOSITORY_INVALID_CODE,
        );
      }
    }
  }

  private validateManifestDependencyEntries(
    manifest: PackageManifest,
    location: SourceLocation,
  ): void {
    for (const field of ["dependencies", "devDependencies"] as const) {
      const dependencies = manifest[field];
      if (!dependencies) continue;

      if (typeof dependencies !== "object" || Array.isArray(dependencies)) {
        throw new CompilerError(
          `Invalid '${field}' field`,
          `'${field}' must be an object mapping package names to version or source strings.`,
          location,
          PACKAGE_MANIFEST_DEPENDENCIES_INVALID_CODE,
        );
      }

      for (const [packageName, source] of Object.entries(dependencies)) {
        if (!/^[a-z0-9-]+$/.test(packageName)) {
          throw new CompilerError(
            `Invalid '${field}' package name: ${packageName}`,
            "Use lowercase package names with digits and hyphens only.",
            location,
            PACKAGE_MANIFEST_DEPENDENCIES_INVALID_CODE,
          );
        }

        if (typeof source !== "string" || source.trim().length === 0) {
          throw new CompilerError(
            `Invalid '${field}' source for ${packageName}`,
            "Use a non-empty version, range, package name, or file source string.",
            location,
            PACKAGE_MANIFEST_DEPENDENCIES_INVALID_CODE,
          );
        }
      }
    }
  }

  private validateManifestScriptEntries(
    manifest: PackageManifest,
    location: SourceLocation,
  ): void {
    if (!manifest.scripts) return;

    for (const [scriptName, command] of Object.entries(manifest.scripts)) {
      if (
        scriptName.length === 0 ||
        typeof command !== "string" ||
        command.trim().length === 0
      ) {
        throw new CompilerError(
          "Invalid 'scripts' field",
          "'scripts' entries must map non-empty script names to command strings.",
          location,
          PACKAGE_MANIFEST_SCRIPTS_INVALID_CODE,
        );
      }
    }
  }

  private validateManifestBinEntries(
    manifest: PackageManifest,
    packageDir: string,
    location: SourceLocation,
  ): void {
    if (!manifest.bin) return;

    for (const [commandName, executablePath] of Object.entries(manifest.bin)) {
      if (!this.isSafeBinCommandName(commandName)) {
        throw new CompilerError(
          `Invalid 'bin' command: ${commandName}`,
          "Use a plain command name without path separators.",
          location,
          PACKAGE_MANIFEST_BIN_INVALID_CODE,
        );
      }

      if (
        typeof executablePath !== "string" ||
        !this.isSafePackageRelativePath(executablePath)
      ) {
        throw new CompilerError(
          `Invalid 'bin' path for ${commandName}: ${String(executablePath)}`,
          "Use a package-relative executable path without empty, '.', or '..' segments.",
          location,
          PACKAGE_MANIFEST_BIN_INVALID_CODE,
        );
      }

      const resolvedPath = this.resolvePackageRelativePath(
        packageDir,
        executablePath,
      );
      if (!this.isWithinPackage(packageDir, resolvedPath)) {
        throw new CompilerError(
          `Invalid 'bin' path for ${commandName}: ${executablePath}`,
          "Use a package-relative executable path inside the package root.",
          location,
          PACKAGE_MANIFEST_BIN_INVALID_CODE,
        );
      }
    }
  }

  private validatePackageBinFile(
    packageDir: string,
    relativePath: string,
    manifestPath: string,
  ): string {
    const location: SourceLocation = {
      file: manifestPath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    };
    const fullPath = this.resolvePackageRelativePath(packageDir, relativePath);
    const binaryStat = this.tryLstat(fullPath);

    if (!binaryStat) {
      throw new CompilerError(
        `Missing package bin entry: ${relativePath}`,
        "Package bin entries must point to regular files included in the package.",
        location,
      );
    }

    if (binaryStat.isSymbolicLink()) {
      throw new CompilerError(
        `Unsupported package bin entry: ${relativePath}`,
        "Package bin entries must be regular files, not symbolic links.",
        location,
      );
    }

    if (!binaryStat.isFile()) {
      throw new CompilerError(
        `Unsupported package bin entry: ${relativePath}`,
        "Package bin entries must point to regular files.",
        location,
      );
    }

    const packageRoot = fs.realpathSync(packageDir);
    const realBinaryPath = fs.realpathSync(fullPath);
    if (!this.isWithinPackage(packageRoot, realBinaryPath)) {
      throw new CompilerError(
        `Invalid 'bin' path for ${relativePath}`,
        "Package bin entries must resolve inside the package root.",
        location,
      );
    }

    return fullPath;
  }

  private isSafeBinCommandName(commandName: string): boolean {
    return (
      commandName.length > 0 &&
      commandName !== "." &&
      commandName !== ".." &&
      !commandName.includes("/") &&
      !commandName.includes("\\")
    );
  }

  private isSafePackageRelativePath(relativePath: string): boolean {
    if (relativePath.length === 0) return false;
    if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
      return false;
    }

    const parts = relativePath.split(/[\\/]/);
    return parts.every(
      (part) => part.length > 0 && part !== "." && part !== "..",
    );
  }

  private isSafeManifestRelativePath(relativePath: string): boolean {
    if (relativePath.length === 0) return false;
    if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
      return false;
    }

    const parts = relativePath.split(/[\\/]/);
    return parts.every(
      (part) => part.length > 0 && part !== "." && part !== "..",
    );
  }

  private resolvePackageRelativePath(
    packageDir: string,
    relativePath: string,
  ): string {
    return path.resolve(packageDir, ...relativePath.split(/[\\/]/));
  }

  private tryLstat(filePath: string): fs.Stats | undefined {
    try {
      return fs.lstatSync(filePath);
    } catch (error) {
      if (
        this.isNodeErrorCode(error, "ENOENT") ||
        this.isNodeErrorCode(error, "ENOTDIR")
      ) {
        return undefined;
      }
      throw error;
    }
  }

  private isNodeErrorCode(error: unknown, code: string): boolean {
    return (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === code
    );
  }

  /**
   * Calculate hash of package contents
   */
  private calculatePackageHash(packageDir: string): string {
    const hash = crypto.createHash("sha256");
    const packageRoot = path.resolve(packageDir);

    const files = this.getPackageHashFiles(packageRoot);
    files.sort((left, right) =>
      path
        .relative(packageRoot, left)
        .localeCompare(path.relative(packageRoot, right)),
    );

    for (const file of files) {
      const relativePath = path
        .relative(packageRoot, file)
        .split(path.sep)
        .join("/");
      const content = fs.readFileSync(file);
      hash.update(relativePath);
      hash.update("\0");
      hash.update(content);
      hash.update("\0");
    }

    return hash.digest("hex");
  }

  private calculateFileHash(filePath: string): string {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return hash.digest("hex");
  }

  private getPackageHashFiles(packageDir: string): string[] {
    const files = new Set<string>();
    const manifestPath = path.join(packageDir, "bpl.json");

    if (fs.existsSync(manifestPath)) {
      files.add(manifestPath);
    }

    for (const file of this.getAllBplFiles(packageDir)) {
      files.add(file);
    }

    const manifest = this.tryReadManifestJson(manifestPath);
    if (
      manifest?.bin &&
      typeof manifest.bin === "object" &&
      !Array.isArray(manifest.bin)
    ) {
      for (const relativeBinaryPath of Object.values(manifest.bin)) {
        if (typeof relativeBinaryPath !== "string") continue;
        if (!this.isSafePackageRelativePath(relativeBinaryPath)) continue;

        const binaryPath = this.resolvePackageRelativePath(
          packageDir,
          relativeBinaryPath,
        );
        if (!this.isWithinPackage(packageDir, binaryPath)) continue;
        if (!fs.existsSync(binaryPath)) continue;

        const stat = fs.lstatSync(binaryPath);
        if (stat.isSymbolicLink() || !stat.isFile()) continue;

        const packageRoot = fs.realpathSync(packageDir);
        const realBinaryPath = fs.realpathSync(binaryPath);
        if (this.isWithinPackage(packageRoot, realBinaryPath)) {
          files.add(binaryPath);
        }
      }
    }

    return [...files];
  }

  private tryReadManifestJson(
    manifestPath: string,
  ): Partial<PackageManifest> | null {
    try {
      return JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as Partial<PackageManifest>;
    } catch {
      return null;
    }
  }

  private isWithinPackage(packageDir: string, filePath: string): boolean {
    const relativePath = path.relative(packageDir, filePath);
    return (
      relativePath !== "" &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath)
    );
  }

  /**
   * Get all .bpl files in directory recursively
   */
  private getAllBplFiles(dir: string): string[] {
    const files: string[] = [];

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.lstatSync(fullPath);

      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        // Skip node_modules, bpl_modules, .bpl-cache, etc.
        if (
          item !== "node_modules" &&
          item !== "bpl_modules" &&
          !item.startsWith(".")
        ) {
          files.push(...this.getAllBplFiles(fullPath));
        }
      } else if (item.endsWith(".bpl")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Copy directory recursively
   */
  private copyDir(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Create a package archive
   */
  pack(packageDir: string, outputDir?: string): string {
    const manifest = this.loadManifest(packageDir);
    const outputPath = outputDir || packageDir;
    const manifestPath = path.join(packageDir, "bpl.json");
    this.ensurePackageOutputDirectory(outputPath, manifestPath);

    // Create tarball filename
    const tarballName = `${manifest.name}-${manifest.version}.tgz`;
    const tarballPath = path.join(outputPath, tarballName);
    this.ensurePackageArchiveOutputFile(tarballPath, manifestPath);

    compilerLog.info(`Packing ${manifest.name}@${manifest.version}...`);

    // Get files to include
    const files = this.getAllBplFiles(packageDir);

    // Also include 'bin' files
    if (manifest.bin) {
      for (const binaryPath of Object.values(manifest.bin)) {
        const fullPath = this.validatePackageBinFile(
          packageDir,
          binaryPath as string,
          manifestPath,
        );
        files.push(fullPath);
      }
    }

    if (files.length === 0) {
      throw new CompilerError(
        "No .bpl files found in package",
        "Add some .bpl files to the package directory.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    compilerLog.info(`Including ${files.length} source files`);

    // Create a temporary directory for packing
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-pack-"));

    try {
      // Copy files to temp directory maintaining structure
      const packageRoot = path.join(tempDir, "package");
      fs.mkdirSync(packageRoot, { recursive: true });

      // Copy manifest
      fs.copyFileSync(manifestPath, path.join(packageRoot, "bpl.json"));

      // Copy source files
      for (const file of files) {
        const relativePath = path.relative(packageDir, file);
        const targetPath = path.join(packageRoot, relativePath);
        const targetDir = path.dirname(targetPath);

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.copyFileSync(file, targetPath);
      }

      // Create tarball
      const archiveTool = getPackageArchiveTool();
      this.createPackageArchiveAtomically(
        archiveTool,
        tarballPath,
        tempDir,
        manifestPath,
      );

      compilerLog.info(`✓ Package created: ${tarballName}`);
      this.writeArchiveProvenance(tarballPath, packageRoot, manifest);

      // Calculate and display size
      const stats = fs.statSync(tarballPath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      compilerLog.info(`Size: ${sizeKB} KB`);

      return tarballPath;
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private createPackageArchiveAtomically(
    archiveTool: string,
    tarballPath: string,
    tempDir: string,
    manifestPath: string,
  ): void {
    for (let attempt = 0; attempt < 10; attempt++) {
      const tempTarballPath = this.getAtomicWriteTempPath(tarballPath, attempt);
      if (this.tryLstat(tempTarballPath)) {
        continue;
      }

      try {
        const result = spawnSync(
          archiveTool,
          ["-czf", tempTarballPath, "-C", tempDir, "package"],
          {
            stdio: "pipe",
            timeout: getPackageArchiveToolTimeoutMs(),
          },
        );

        if (result.status !== 0) {
          const error = this.formatSpawnFailure(result, "Unknown error");
          throw new CompilerError(
            `Failed to create tarball: ${error}`,
            `Check if '${archiveTool}' is available and you have write permissions.`,
            {
              file: manifestPath,
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
          );
        }

        const tempArchiveStat = this.tryLstat(tempTarballPath);
        if (!tempArchiveStat?.isFile()) {
          throw new CompilerError(
            `Package archive tool did not create a regular file: ${tempTarballPath}`,
            `Check if '${archiveTool}' is a compatible tar implementation.`,
            {
              file: manifestPath,
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
          );
        }

        this.ensurePackageArchiveOutputFile(tarballPath, manifestPath);
        this.preserveExistingPackageArchiveMode(
          tempTarballPath,
          tarballPath,
        );
        fs.renameSync(tempTarballPath, tarballPath);
        return;
      } finally {
        this.removePackageArchiveTempPath(tempTarballPath);
      }
    }

    throw new CompilerError(
      `Failed to create package archive temporary file: ${tarballPath}`,
      "Remove stale temporary package archives from the output directory and retry.",
      {
        file: manifestPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private preserveExistingPackageArchiveMode(
    tempArchivePath: string,
    archivePath: string,
  ): void {
    const existingArchive = this.tryLstat(archivePath);
    if (existingArchive?.isFile()) {
      fs.chmodSync(tempArchivePath, existingArchive.mode & 0o777);
    }
  }

  private ensurePackageOutputDirectory(
    outputPath: string,
    manifestPath: string,
  ): void {
    const existing = this.tryLstat(outputPath);
    if (existing?.isSymbolicLink()) {
      throw new CompilerError(
        `Package output path is a symbolic link: ${outputPath}`,
        "Choose a real directory path for package output.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    if (existing && !existing.isDirectory()) {
      throw new CompilerError(
        `Package output path is not a directory: ${outputPath}`,
        "Choose a directory path for package output.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    this.assertWritablePackageOutputParent(outputPath, manifestPath);
    fs.mkdirSync(outputPath, { recursive: true });
  }

  private assertWritablePackageOutputParent(
    outputPath: string,
    manifestPath: string,
  ): void {
    for (
      let parentPath = path.dirname(path.resolve(outputPath));
      ;
      parentPath = path.dirname(parentPath)
    ) {
      const existing = this.tryLstat(parentPath);
      if (existing) {
        if (existing.isSymbolicLink()) {
          throw new CompilerError(
            `Package output parent path is a symbolic link: ${parentPath}`,
            "Choose an output path whose parent directories are real directories.",
            {
              file: manifestPath,
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
          );
        }

        if (!existing.isDirectory()) {
          throw new CompilerError(
            `Package output parent path is not a directory: ${parentPath}`,
            "Choose an output path whose parent is a directory.",
            {
              file: manifestPath,
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
          );
        }

        return;
      }

      const nextParent = path.dirname(parentPath);
      if (nextParent === parentPath) return;
    }
  }

  private removePackageArchiveTempPath(filePath: string): void {
    try {
      fs.rmSync(filePath, { force: true, recursive: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private ensurePackageArchiveOutputFile(
    archivePath: string,
    manifestPath: string,
  ): void {
    const existing = this.tryLstat(archivePath);
    if (existing?.isSymbolicLink()) {
      throw new CompilerError(
        `Package archive path is a symbolic link: ${archivePath}`,
        "Remove the existing path or choose a different package version/output directory.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }
    if (existing && !existing.isFile()) {
      throw new CompilerError(
        `Package archive path is not a file: ${archivePath}`,
        "Remove the existing path or choose a different package version/output directory.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }
  }

  /**
   * Install a package from tarball or name
   */
  install(
    packageSource: string,
    options: PackageOptionsVerbose = { verbose: false, global: false },
    installStack: string[] = [],
    expectedPackageName?: string,
    sourceContext: PackageInstallSourceContext = {},
  ): void {
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    const targetDirLabel = options.global
      ? "Global package directory"
      : "Local package directory";

    let tarballPath: string;
    let lockSource = sourceContext.lockSource ?? packageSource;

    // Check if source is a file path or package name
    const directFileSource = this.stripPackageFileSourcePrefix(packageSource);
    const directPackageSource =
      packageSource.startsWith("file:") ||
      this.isPackageFileSource(directFileSource)
        ? this.resolveDependencyFileSource(this.projectRoot, directFileSource)
        : packageSource;
    if (this.tryLstat(directPackageSource)) {
      tarballPath = directPackageSource;
      if (!sourceContext.lockSource && directPackageSource !== packageSource) {
        lockSource = this.formatDirectPackageFileLockSource(packageSource);
      }
    } else {
      // Look for package in global registry
      const globalTarballPath = this.resolveGlobalPackageSource(packageSource);

      if (!globalTarballPath) {
        throw new CompilerError(
          `Package not found: ${packageSource}`,
          "Check the package name or path.",
          {
            file: packageSource,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
          "BPL_PACKAGE_NOT_FOUND",
        );
      }

      tarballPath = globalTarballPath;
      if (!sourceContext.lockSource) {
        lockSource = path.basename(globalTarballPath);
      }
    }
    const dependencyBaseDir = path.dirname(tarballPath);

    if (options.verbose) {
      compilerLog.info(`Installing from: ${tarballPath}`);
    }

    this.ensurePackageArchiveFile(tarballPath);
    this.verifyArchiveProvenanceBeforeInstall(tarballPath);

    // Extract to a unique temporary directory first.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-install-"));

    try {
      this.validatePackageArchiveMembers(tarballPath);

      // Extract tarball
      const archiveTool = getPackageArchiveTool();
      const extractResult = spawnSync(
        archiveTool,
        ["-xzf", tarballPath, "-C", tempDir],
        {
          stdio: options.verbose ? "inherit" : "pipe",
          timeout: getPackageArchiveToolTimeoutMs(),
        },
      );

      if (extractResult.status !== 0) {
        const error = this.formatSpawnFailure(extractResult, "Unknown error");
        throw new CompilerError(
          `Failed to extract package: ${error}`,
          `Check if '${archiveTool}' is available.`,
          {
            file: tarballPath,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      const packageDir = path.join(tempDir, "package");
      this.validateExtractedPackageTree(packageDir, tarballPath);
      const manifest = this.loadManifest(packageDir);
      const extractedManifestPath = path.join(packageDir, "bpl.json");
      const cachedArchivePath = path.join(
        this.globalPackageDir,
        `${manifest.name}-${manifest.version}.tgz`,
      );
      const effectiveExpectedName =
        expectedPackageName ?? this.inferExpectedPackageName(packageSource);

      if (effectiveExpectedName && manifest.name !== effectiveExpectedName) {
        throw new CompilerError(
          `Package name mismatch: requested '${effectiveExpectedName}' but archive contains '${manifest.name}'`,
          "Install the archive under its manifest name, or fix the package manifest/source mapping.",
          {
            file: path.join(packageDir, "bpl.json"),
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      const cycleStart = installStack.indexOf(manifest.name);
      if (cycleStart !== -1) {
        const cycle = [...installStack.slice(cycleStart), manifest.name].join(
          " -> ",
        );
        throw new CompilerError(
          `Cyclic package dependency detected: ${cycle}`,
          "Break the cycle by removing one dependency edge or moving shared code into a third package.",
          {
            file: path.join(packageDir, "bpl.json"),
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      this.ensurePackageManagerDirectory(targetDir, targetDirLabel);
      const localLock = options.global ? undefined : this.loadLockFile();
      if (options.global) {
        this.ensurePackageArchiveOutputFile(
          cachedArchivePath,
          extractedManifestPath,
        );
        this.ensurePackageProvenanceOutputFile(
          cachedArchivePath,
          extractedManifestPath,
        );
      }

      compilerLog.info(`Installing ${manifest.name}@${manifest.version}...`);

      // Create target directory
      const installPath = path.join(targetDir, manifest.name);
      this.assertPackageBinaryTargetsWritable(
        manifest,
        packageDir,
        options.global || false,
      );
      this.installPackageDirectory(
        packageDir,
        installPath,
        path.join(packageDir, "bpl.json"),
      );

      // Link binaries
      this.linkBinaries(manifest, installPath, options.global || false);

      if (options.global) {
        this.ensurePackageArchiveOutputFile(
          cachedArchivePath,
          extractedManifestPath,
        );
        if (path.resolve(tarballPath) !== path.resolve(cachedArchivePath)) {
          this.copyFileAtomically(tarballPath, cachedArchivePath);
        }
        this.writeArchiveProvenance(cachedArchivePath, packageDir, manifest);
      } else {
        this.recordLocalInstall(manifest, installPath, lockSource, localLock);
      }

      compilerLog.info(`✓ Installed ${manifest.name}@${manifest.version}`);

      if (options.global) {
        compilerLog.info(`Location: ${installPath}`);
      }

      this.installPackageDependencies(
        manifest,
        options,
        [...installStack, manifest.name],
        dependencyBaseDir,
      );
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private installPackageDirectory(
    packageDir: string,
    installPath: string,
    manifestPath: string,
  ): void {
    fs.mkdirSync(path.dirname(installPath), { recursive: true });
    this.assertPackageInstallTargetReplaceable(installPath, manifestPath);
    const stagingPath = this.createTemporaryInstallPath(
      installPath,
      manifestPath,
      "stage",
    );
    let backupPath: string | undefined;
    let movedExisting = false;

    try {
      this.copyDir(packageDir, stagingPath);

      if (this.tryLstat(installPath)) {
        backupPath = this.createTemporaryInstallPath(
          installPath,
          manifestPath,
          "backup",
        );
        fs.renameSync(installPath, backupPath);
        movedExisting = true;
      }

      try {
        fs.renameSync(stagingPath, installPath);
      } catch (error) {
        if (movedExisting && backupPath) {
          this.restorePackageInstallBackup(backupPath, installPath);
          movedExisting = false;
        }
        throw error;
      }

      if (backupPath) {
        this.removeDirectoryBestEffort(backupPath);
        movedExisting = false;
      }
    } catch (error) {
      this.removeDirectoryBestEffort(stagingPath);
      if (movedExisting && backupPath && !this.tryLstat(installPath)) {
        this.restorePackageInstallBackup(backupPath, installPath);
      }

      if (error instanceof CompilerError) {
        throw error;
      }

      throw new CompilerError(
        `Failed to install package to ${installPath}: ${error instanceof Error ? error.message : String(error)}`,
        "Check package directory permissions and retry.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    } finally {
      this.removeDirectoryBestEffort(stagingPath);
    }
  }

  private createTemporaryInstallPath(
    installPath: string,
    manifestPath: string,
    label: string,
  ): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const tempPath = path.join(
        path.dirname(path.resolve(installPath)),
        `.${path.basename(installPath)}.${process.pid}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}-${label}-${attempt}.tmp`,
      );
      if (!this.tryLstat(tempPath)) {
        return tempPath;
      }
    }

    throw new CompilerError(
      `Failed to create temporary package install path for ${installPath}`,
      "Remove stale temporary package install directories and retry.",
      {
        file: manifestPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private restorePackageInstallBackup(
    backupPath: string,
    installPath: string,
  ): void {
    try {
      fs.renameSync(backupPath, installPath);
    } catch {
      // Preserve the original error; the backup remains on disk for recovery.
    }
  }

  private removeDirectoryBestEffort(dirPath: string | undefined): void {
    if (!dirPath) return;
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private assertPackageInstallTargetReplaceable(
    installPath: string,
    manifestPath: string,
  ): void {
    const existingTarget = this.tryLstat(installPath);
    if (!existingTarget || existingTarget.isDirectory()) {
      return;
    }

    const packageName = path.basename(installPath);
    const existingKind = existingTarget.isSymbolicLink()
      ? "A symbolic link"
      : "A non-directory file";
    throw new CompilerError(
      `Cannot install package '${packageName}'`,
      `${existingKind} already exists at ${installPath}. Move it out of the way and try again.`,
      {
        file: manifestPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private ensurePackageArchiveFile(archivePath: string): void {
    const archiveStats = this.tryLstat(archivePath);
    if (archiveStats?.isSymbolicLink()) {
      throw new CompilerError(
        `Package archive path is a symbolic link: ${archivePath}`,
        "Install a real .tgz package archive, not a symbolic link.",
        {
          file: archivePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_ARCHIVE_SYMLINK_CODE,
      );
    }

    const symlinkedParent = findSymlinkedParentPath(archivePath);
    if (symlinkedParent) {
      throw new CompilerError(
        `Package archive parent path is a symbolic link: ${symlinkedParent}`,
        "Install from a real directory path, not through a symbolic-link parent.",
        {
          file: archivePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_ARCHIVE_PARENT_SYMLINK_CODE,
      );
    }

    if (!archiveStats?.isFile()) {
      throw new CompilerError(
        `Package archive path is not a file: ${archivePath}`,
        "Install a .tgz package archive or a package name from the cache.",
        {
          file: archivePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_ARCHIVE_NOT_FILE_CODE,
      );
    }
  }

  private installPackageDependencies(
    manifest: PackageManifest,
    options: PackageOptionsVerbose,
    installStack: string[],
    dependencyBaseDir: string,
  ): void {
    const deps = manifest.dependencies || {};
    const entries = Object.entries(deps);
    if (entries.length === 0) return;

    compilerLog.info(
      `Installing ${entries.length} package dependenc${entries.length === 1 ? "y" : "ies"} for ${manifest.name}@${manifest.version}...`,
    );

    for (const [name, source] of entries) {
      const resolved = this.resolveDependencySource(
        name,
        source,
        dependencyBaseDir,
      );
      this.install(
        resolved.packageSource,
        {
          ...options,
          locked: false,
        },
        installStack,
        name,
        { lockSource: resolved.lockSource },
      );
    }
  }

  private inferExpectedPackageName(packageSource: string): string | undefined {
    const fileSource = this.stripPackageFileSourcePrefix(packageSource);
    if (fs.existsSync(fileSource)) return undefined;
    if (!packageSource.startsWith("file:")) {
      const installSpec = parsePackageInstallSpec(packageSource);
      if (installSpec) return installSpec.name;
    }
    const fileName = this.getPackageSourceBasename(fileSource);
    const parsed = parsePackageTarballName(fileName);
    if (parsed) return parsed.name;
    if (/^[a-z0-9-]+$/.test(fileSource)) return fileSource;
    return undefined;
  }

  private resolveGlobalPackageSource(packageSource: string): string | null {
    if (
      !this.readPackageManagerDirectoryStats(
        this.globalPackageDir,
        "Global package directory",
      )
    ) {
      return null;
    }

    const fileSource = this.stripPackageFileSourcePrefix(packageSource);
    if (fileSource.endsWith(".tgz")) {
      const exactTarballPath = path.join(this.globalPackageDir, fileSource);
      if (this.tryLstat(exactTarballPath)) {
        return exactTarballPath;
      }

      const cachedTarballPath = path.join(
        this.globalPackageDir,
        this.getPackageSourceBasename(fileSource),
      );
      if (this.tryLstat(cachedTarballPath)) {
        return cachedTarballPath;
      }
    }

    const installSpec = parsePackageInstallSpec(packageSource);
    if (installSpec) {
      return this.resolveGlobalPackageVersionSource(
        installSpec.name,
        installSpec.versionSpec,
      );
    }

    const matching = this.findGlobalPackageTarballs(packageSource);
    if (matching.length === 0) {
      return null;
    }

    return path.join(this.globalPackageDir, matching[0]!.file);
  }

  private resolveGlobalPackageVersionSource(
    packageName: string,
    versionSpec: string,
  ): string {
    const matching = this.findGlobalPackageTarballs(packageName).filter((entry) =>
      satisfiesVersionSelector(entry.versionText, versionSpec),
    );

    if (matching.length === 0) {
      throw new CompilerError(
        `Package not found: ${packageName}@${versionSpec}`,
        `Add a cached archive matching ${packageName}@${versionSpec} with 'bpl install <archive> --global' or use 'bpl package-cache list ${packageName}' to inspect available versions.`,
        {
          file: this.globalPackageDir,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    return path.join(this.globalPackageDir, matching[0]!.file);
  }

  private getArchiveProvenancePath(archivePath: string): string {
    return `${archivePath}.bplmeta.json`;
  }

  private writeArchiveProvenance(
    archivePath: string,
    packageDir: string,
    manifest: PackageManifest,
  ): PackageArchiveProvenance {
    const stat = fs.statSync(archivePath);
    const provenance: PackageArchiveProvenance = {
      schemaVersion: 1,
      name: manifest.name,
      version: manifest.version,
      archiveFile: path.basename(archivePath),
      archiveSha256: this.calculateFileHash(archivePath),
      packageHash: this.calculatePackageHash(packageDir),
      sizeBytes: stat.size,
      createdAt: new Date().toISOString(),
      manifest,
    };

    const provenancePath = this.getArchiveProvenancePath(archivePath);
    this.ensurePackageProvenanceOutputFile(
      archivePath,
      path.join(packageDir, "bpl.json"),
    );

    this.writeFileAtomically(provenancePath, JSON.stringify(provenance, null, 2));

    return provenance;
  }

  private ensurePackageProvenanceOutputFile(
    archivePath: string,
    locationPath: string,
  ): void {
    const provenancePath = this.getArchiveProvenancePath(archivePath);
    const provenanceStat = this.tryLstat(provenancePath);
    if (provenanceStat?.isSymbolicLink()) {
      throw new CompilerError(
        `Package provenance path is a symbolic link: ${provenancePath}`,
        "Remove the existing path or choose a different package output directory.",
        {
          file: locationPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }
    if (provenanceStat && !provenanceStat.isFile()) {
      throw new CompilerError(
        `Package provenance path is not a file: ${provenancePath}`,
        "Remove the existing path or choose a different package output directory.",
        {
          file: locationPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }
  }

  private readArchiveProvenance(
    archivePath: string,
  ):
    | { ok: true; provenance: PackageArchiveProvenance }
    | { ok: false; kind: "missing" | "invalid"; message: string } {
    const provenancePath = this.getArchiveProvenancePath(archivePath);
    const provenanceStat = this.tryLstat(provenancePath);
    if (!provenanceStat) {
      return {
        ok: false,
        kind: "missing",
        message: "No package provenance sidecar found",
      };
    }
    if (provenanceStat.isSymbolicLink()) {
      return {
        ok: false,
        kind: "invalid",
        message: "Package provenance sidecar is a symbolic link",
      };
    }
    if (!provenanceStat.isFile()) {
      return {
        ok: false,
        kind: "invalid",
        message: "Package provenance sidecar is not a file",
      };
    }

    try {
      const parsed = JSON.parse(
        fs.readFileSync(provenancePath, "utf-8"),
      ) as Partial<PackageArchiveProvenance>;

      if (
        parsed.schemaVersion !== 1 ||
        typeof parsed.name !== "string" ||
        typeof parsed.version !== "string" ||
        typeof parsed.archiveFile !== "string" ||
        typeof parsed.archiveSha256 !== "string" ||
        typeof parsed.packageHash !== "string" ||
        typeof parsed.sizeBytes !== "number" ||
        typeof parsed.createdAt !== "string" ||
        !parsed.manifest ||
        typeof parsed.manifest !== "object"
      ) {
        return {
          ok: false,
          kind: "invalid",
          message: "Package provenance sidecar has an invalid schema",
        };
      }

      return {
        ok: true,
        provenance: parsed as PackageArchiveProvenance,
      };
    } catch (error) {
      return {
        ok: false,
        kind: "invalid",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private describeArchiveProvenance(
    archivePath: string,
    packageName: string,
    version: string,
  ): Pick<
    PackageCacheEntry,
    | "archiveSha256"
    | "packageHash"
    | "provenancePath"
    | "provenanceStatus"
    | "provenanceIssue"
  > {
    const provenancePath = this.getArchiveProvenancePath(archivePath);
    const provenance = this.readArchiveProvenance(archivePath);
    if (!provenance.ok) {
      return {
        provenancePath,
        provenanceStatus: provenance.kind,
        provenanceIssue: provenance.message,
      };
    }

    const metadata = provenance.provenance;
    if (metadata.archiveFile !== path.basename(archivePath)) {
      return {
        archiveSha256: metadata.archiveSha256,
        packageHash: metadata.packageHash,
        provenancePath,
        provenanceStatus: "manifest-mismatch",
        provenanceIssue: `Provenance archive file is ${metadata.archiveFile}`,
      };
    }

    if (metadata.name !== packageName || metadata.version !== version) {
      return {
        archiveSha256: metadata.archiveSha256,
        packageHash: metadata.packageHash,
        provenancePath,
        provenanceStatus: "manifest-mismatch",
        provenanceIssue: `Provenance declares ${metadata.name}@${metadata.version}`,
      };
    }

    const archiveSha256 = this.calculateFileHash(archivePath);
    if (metadata.archiveSha256 !== archiveSha256) {
      return {
        archiveSha256: metadata.archiveSha256,
        packageHash: metadata.packageHash,
        provenancePath,
        provenanceStatus: "archive-hash-mismatch",
        provenanceIssue: `Archive sha256 is ${archiveSha256}`,
      };
    }

    return {
      archiveSha256: metadata.archiveSha256,
      packageHash: metadata.packageHash,
      provenancePath,
      provenanceStatus: "verified",
    };
  }

  private verifyArchiveProvenanceBeforeInstall(archivePath: string): void {
    const parsed = parsePackageTarballName(path.basename(archivePath));
    if (!parsed) return;

    const summary = this.describeArchiveProvenance(
      archivePath,
      parsed.name,
      parsed.version,
    );
    if (
      summary.provenanceStatus === "verified" ||
      summary.provenanceStatus === "missing"
    ) {
      return;
    }

    throw new CompilerError(
      `Package archive provenance check failed: ${path.basename(archivePath)}`,
      summary.provenanceIssue ||
        "Remove the cached archive or regenerate it with 'bpl pack'.",
      {
        file: summary.provenancePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private validatePackageArchiveMembers(tarballPath: string): void {
    const archiveTool = getPackageArchiveTool();
    this.validatePackageArchiveEntryTypes(archiveTool, tarballPath);

    const listResult = spawnSync(archiveTool, ["-tzf", tarballPath], {
      stdio: "pipe",
      timeout: getPackageArchiveToolTimeoutMs(),
    });

    if (listResult.status !== 0) {
      const error = this.formatSpawnFailure(listResult, "Unknown error");
      throw new CompilerError(
        `Failed to inspect package archive: ${error}`,
        `Check if the package archive is valid and '${archiveTool}' is available.`,
        {
          file: tarballPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    const members = listResult.stdout
      .toString()
      .split(/\r?\n/)
      .filter((member) => member.length > 0);

    for (const member of members) {
      if (!this.isSafePackageArchiveMember(member)) {
        throw new CompilerError(
          `Unsafe package archive member: ${member}`,
          "Package archives may only contain relative paths inside the package/ directory.",
          {
            file: tarballPath,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }
    }
  }

  private validatePackageArchiveEntryTypes(
    archiveTool: string,
    tarballPath: string,
  ): void {
    const listResult = spawnSync(archiveTool, ["-tvzf", tarballPath], {
      stdio: "pipe",
      timeout: getPackageArchiveToolTimeoutMs(),
    });

    if (listResult.status !== 0) {
      const error = this.formatSpawnFailure(listResult, "Unknown error");
      throw new CompilerError(
        `Failed to inspect package archive: ${error}`,
        `Check if the package archive is valid and '${archiveTool}' is available.`,
        {
          file: tarballPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    for (const line of listResult.stdout.toString().split(/\r?\n/)) {
      if (line.length === 0) continue;

      const entryType = line[0];
      if (entryType === "l") {
        this.throwUnsupportedPackageArchiveEntry(
          tarballPath,
          this.extractVerboseTarMember(line),
          "Package archives may not contain symbolic links.",
        );
      }
      if (entryType === "h") {
        this.throwUnsupportedPackageArchiveEntry(
          tarballPath,
          this.extractVerboseTarMember(line),
          "Package archives may not contain hard links.",
        );
      }
    }
  }

  private extractVerboseTarMember(line: string): string {
    const linkTargetMarker = line.includes(" -> ") ? " -> " : " link to ";
    const memberEnd = line.includes(linkTargetMarker)
      ? line.indexOf(linkTargetMarker)
      : line.length;
    const lineWithoutTarget = line.slice(0, memberEnd);
    const packagePathStart = lineWithoutTarget.indexOf(" package/");

    if (packagePathStart !== -1) {
      return lineWithoutTarget.slice(packagePathStart + 1);
    }

    if (lineWithoutTarget.endsWith(" package")) {
      return "package";
    }

    return "package archive member";
  }

  private formatSpawnFailure(
    result: {
      error?: Error;
      stderr?: Buffer | string | null;
      stdout?: Buffer | string | null;
      status?: number | null;
    },
    fallback: string,
  ): string {
    if (result.error) {
      return (
        formatSpawnFailureReason(result.error, {
          permissionDenied: "permission denied while starting command",
        }) ?? result.error.message
      );
    }

    return (
      result.stderr?.toString().trim() ||
      result.stdout?.toString().trim() ||
      (result.status === null || result.status === undefined
        ? fallback
        : `exited with status ${result.status}`)
    );
  }

  private isSafePackageArchiveMember(member: string): boolean {
    const normalized = member.replace(/\/+$/g, "");
    if (normalized.length === 0) return false;
    if (normalized.includes("\\")) return false;
    if (
      path.posix.isAbsolute(normalized) ||
      path.win32.isAbsolute(normalized)
    ) {
      return false;
    }

    const parts = normalized.split("/");
    if (
      parts.some((part) => part.length === 0 || part === "." || part === "..")
    ) {
      return false;
    }

    return normalized === "package" || normalized.startsWith("package/");
  }

  private validateExtractedPackageTree(
    packageDir: string,
    tarballPath: string,
  ): void {
    if (!fs.existsSync(packageDir)) return;

    const packageRoot = fs.realpathSync(packageDir);
    const visit = (currentDir: string) => {
      for (const item of fs.readdirSync(currentDir)) {
        const itemPath = path.join(currentDir, item);
        const stat = fs.lstatSync(itemPath);
        const archivePath = path
          .relative(packageDir, itemPath)
          .split(path.sep)
          .join("/");

        if (stat.isSymbolicLink()) {
          this.throwUnsupportedPackageArchiveEntry(
            tarballPath,
            archivePath,
            "Package archives may not contain symbolic links.",
          );
        }

        const realPath = fs.realpathSync(itemPath);
        if (!this.isWithinPackage(packageRoot, realPath)) {
          this.throwUnsupportedPackageArchiveEntry(
            tarballPath,
            archivePath,
            "Package archive entries must resolve inside the package root.",
          );
        }

        if (stat.isDirectory()) {
          visit(itemPath);
        } else if (stat.isFile() && stat.nlink > 1) {
          this.throwUnsupportedPackageArchiveEntry(
            tarballPath,
            archivePath,
            "Package archives may not contain hard links.",
          );
        } else if (!stat.isFile()) {
          this.throwUnsupportedPackageArchiveEntry(
            tarballPath,
            archivePath,
            "Package archives may only contain regular files and directories.",
          );
        }
      }
    };

    visit(packageDir);
  }

  private throwUnsupportedPackageArchiveEntry(
    tarballPath: string,
    archivePath: string,
    help: string,
  ): never {
    throw new CompilerError(
      `Unsupported package archive entry: ${archivePath}`,
      help,
      {
        file: tarballPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private findGlobalPackageTarballs(packageName: string): Array<{
    file: string;
    version: [number, number, number];
    versionText: string;
  }> {
    if (
      !this.readPackageManagerDirectoryStats(
        this.globalPackageDir,
        "Global package directory",
      )
    ) {
      return [];
    }

    const packagePattern = new RegExp(
      `^${escapeRegExp(packageName)}-(\\d+)\\.(\\d+)\\.(\\d+)\\.tgz$`,
    );

    return fs
      .readdirSync(this.globalPackageDir)
      .map((file) => {
        const match = packagePattern.exec(file);
        if (!match) return null;

        const filePath = path.join(this.globalPackageDir, file);
        const stats = this.tryLstat(filePath);
        if (!stats?.isFile()) return null;

        return {
          file,
          version: [Number(match[1]), Number(match[2]), Number(match[3])] as [
            number,
            number,
            number,
          ],
          versionText: `${match[1]}.${match[2]}.${match[3]}`,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          file: string;
          version: [number, number, number];
          versionText: string;
        } => entry !== null,
      )
      .sort((left, right) => compareSemverDesc(left.version, right.version));
  }

  /**
   * Uninstall a package
   */
  uninstall(
    packageName: string,
    options: PackageOptionsGlobal = { global: false },
  ): PackageUninstallResult {
    const location: SourceLocation = {
      file: packageName,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    };
    validatePackageName(
      packageName,
      location,
      PACKAGE_UNINSTALL_NAME_INVALID_CODE,
    );

    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    const targetDirLabel = options.global
      ? "Global package directory"
      : "Local package directory";
    const packagePath = path.join(targetDir, packageName);

    if (!this.readPackageManagerDirectoryStats(targetDir, targetDirLabel)) {
      throw new CompilerError(
        `Package '${packageName}' is not installed ${options.global ? "globally" : "locally"}`,
        "Check the package name.",
        {
          file: packagePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_UNINSTALL_NOT_INSTALLED_CODE,
      );
    }

    const packageRootStats = this.tryLstat(packagePath);
    if (!packageRootStats) {
      throw new CompilerError(
        `Package '${packageName}' is not installed ${options.global ? "globally" : "locally"}`,
        "Check the package name.",
        {
          file: packagePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
        PACKAGE_UNINSTALL_NOT_INSTALLED_CODE,
      );
    }

    if (packageRootStats.isSymbolicLink()) {
      throw new CompilerError(
        "Package root is a symbolic link",
        `The installed package path ${packagePath} is a symbolic link. Move it out of the way and try again.`,
        {
          file: packagePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    if (!packageRootStats.isDirectory()) {
      throw new CompilerError(
        `Invalid package directory: ${packagePath}`,
        "Package root exists but is not a directory.",
        {
          file: packagePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    // Verify it's actually a package directory
    const manifestPath = path.join(packagePath, "bpl.json");
    if (!this.tryLstat(manifestPath)) {
      throw new CompilerError(
        `Invalid package directory: ${packagePath}`,
        "Directory exists but is not a valid package (missing bpl.json).",
        {
          file: packagePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    const manifest = this.loadManifest(packagePath);
    const localLock =
      !options.global && this.tryLstat(this.getLockFilePath())
        ? this.loadLockFile()
        : undefined;

    // Unlink binaries
    if (manifest.bin) {
      const binDir = options.global ? this.globalBinDir : this.localBinDir;
      const binDirLabel = options.global
        ? "Global binary directory"
        : "Local binary directory";
      const binDirStats = this.readPackageManagerDirectoryStats(
        binDir,
        binDirLabel,
      );

      if (binDirStats) {
        for (const [name, relativePath] of Object.entries(manifest.bin)) {
          const targetPath = path.join(binDir, name);
          const existingTarget = this.tryLstat(targetPath);
          if (existingTarget) {
            if (existingTarget.isDirectory()) {
              throw new CompilerError(
                `Cannot unlink package binary '${name}'`,
                `A directory exists at ${targetPath}. Move it out of the way and try again.`,
                {
                  file: path.join(packagePath, "bpl.json"),
                  startLine: 1,
                  startColumn: 1,
                  endLine: 1,
                  endColumn: 1,
                },
              );
            }

            if (!existingTarget.isSymbolicLink()) {
              throw new CompilerError(
                `Cannot unlink package binary '${name}'`,
                `A non-symlink file exists at ${targetPath}. Move it out of the way and try again.`,
                {
                  file: path.join(packagePath, "bpl.json"),
                  startLine: 1,
                  startColumn: 1,
                  endLine: 1,
                  endColumn: 1,
                },
              );
            }

            const expectedSourcePath = this.resolvePackageRelativePath(
              packagePath,
              relativePath,
            );
            const linkedPath = path.resolve(
              path.dirname(targetPath),
              fs.readlinkSync(targetPath),
            );
            if (path.resolve(expectedSourcePath) !== linkedPath) {
              throw new CompilerError(
                `Cannot unlink package binary '${name}'`,
                `The binary link at ${targetPath} does not point to ${expectedSourcePath}. Move it out of the way and try again.`,
                {
                  file: path.join(packagePath, "bpl.json"),
                  startLine: 1,
                  startColumn: 1,
                  endLine: 1,
                  endColumn: 1,
                },
              );
            }

            fs.unlinkSync(targetPath);
          }
        }
      }
    }

    compilerLog.info(`Uninstalling ${manifest.name}@${manifest.version}...`);

    // Remove the package directory
    fs.rmSync(packagePath, { recursive: true, force: true });

    if (!options.global) {
      this.removeLocalLockEntry(manifest.name, localLock);
    }

    compilerLog.info(`✓ Uninstalled ${manifest.name}@${manifest.version}`);
    return {
      name: manifest.name,
      version: manifest.version,
      global: Boolean(options.global),
    };
  }

  /**
   * List installed packages
   */
  list(options: PackageOptionsGlobal = { global: false }): PackageInfo[] {
    const searchDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    const searchDirLabel = options.global
      ? "Global package directory"
      : "Local package directory";

    if (!this.readPackageManagerDirectoryStats(searchDir, searchDirLabel)) {
      return [];
    }

    const packages: PackageInfo[] = [];
    const items = fs.readdirSync(searchDir);

    for (const item of items) {
      const packagePath = path.join(searchDir, item);
      const stat = this.tryLstat(packagePath);

      if (stat?.isDirectory()) {
        try {
          const manifest = this.loadManifest(packagePath);
          const hash = this.calculatePackageHash(packagePath);

          packages.push({
            manifest,
            path: packagePath,
            hash,
          });
        } catch {
          // Skip invalid packages - they may lack bpl.json or have invalid manifests
        }
      }
    }

    return packages.sort((left, right) =>
      this.comparePackageInfoByNameAndPath(left, right),
    );
  }

  listUniqueInstalledPackages(
    options: PackageOptionsGlobal = { global: false },
  ): PackageInfo[] {
    const packages = this.list(options);
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    this.assertUniqueInstalledPackageNames(packages, targetDir);
    return packages;
  }

  private comparePackageInfoByNameAndPath(
    left: PackageInfo,
    right: PackageInfo,
  ): number {
    return (
      left.manifest.name.localeCompare(right.manifest.name) ||
      left.path.localeCompare(right.path)
    );
  }

  private assertUniqueInstalledPackageNames(
    installedPackages: readonly PackageInfo[],
    packageDirectory: string,
  ): void {
    const duplicateIssues =
      this.findDuplicateInstalledPackageNameIssues(installedPackages);
    if (duplicateIssues.length > 0) {
      throw new PackageInstalledNameError(duplicateIssues, packageDirectory);
    }
  }

  listPackageCache(packageName?: string): PackageCacheEntry[] {
    validatePackageCachePackageNameFilter(packageName);

    if (
      !this.readPackageManagerDirectoryStats(
        this.globalPackageDir,
        "Global package directory",
      )
    ) {
      return [];
    }

    return fs
      .readdirSync(this.globalPackageDir)
      .map((file) => {
        const parsed = parsePackageTarballName(file);
        if (!parsed) return null;
        if (packageName && parsed.name !== packageName) return null;

        const filePath = path.join(this.globalPackageDir, file);
        const stat = this.tryLstat(filePath);
        if (!stat?.isFile()) return null;

        return {
          ...parsed,
          file,
          path: filePath,
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          ...this.describeArchiveProvenance(
            filePath,
            parsed.name,
            parsed.version,
          ),
        };
      })
      .filter((entry): entry is PackageCacheEntry => entry !== null)
      .sort((left, right) => {
        const nameDelta = left.name.localeCompare(right.name);
        if (nameDelta !== 0) return nameDelta;
        return compareSemverDesc(
          parseSemverTuple(left.version),
          parseSemverTuple(right.version),
        );
      });
  }

  cleanPackageCache(options: {
    packageName?: string;
    version?: string;
    dryRun?: boolean;
  } = {}): PackageCacheCleanResult {
    validatePackageCacheVersionFilter(options.version);

    const removed = this.listPackageCache(options.packageName).filter((entry) =>
      options.version ? entry.version === options.version : true,
    );

    if (!options.dryRun) {
      for (const entry of removed) {
        const provenanceStats = this.tryLstat(entry.provenancePath);
        if (provenanceStats) {
          fs.rmSync(entry.provenancePath, {
            recursive: provenanceStats.isDirectory(),
            force: true,
          });
        }
        fs.unlinkSync(entry.path);
      }
    }

    return createJsonReport(CLI_JSON_CHECKS.packageCacheClean, true, {
      removed,
      dryRun: Boolean(options.dryRun),
    });
  }

  verifyPackageCache(packageName?: string): PackageCacheVerificationReport {
    const entries = this.listPackageCache(packageName);
    const issues: PackageCacheVerificationIssue[] = [];

    const addIssue = (
      entry: PackageCacheEntry,
      kind: PackageCacheVerificationIssueKind,
      message: string,
      provenancePath: string | undefined = entry.provenancePath,
    ) => {
      issues.push({
        packageName: entry.name,
        version: entry.version,
        kind,
        message,
        path: entry.path,
        provenancePath,
      });
    };

    for (const entry of entries) {
      switch (entry.provenanceStatus) {
        case "missing":
          addIssue(
            entry,
            "missing-provenance",
            `${entry.file}: missing package provenance sidecar`,
          );
          continue;
        case "invalid":
          addIssue(
            entry,
            "invalid-provenance",
            `${entry.file}: invalid package provenance (${entry.provenanceIssue})`,
          );
          continue;
        case "archive-hash-mismatch":
          addIssue(
            entry,
            "archive-hash-mismatch",
            `${entry.file}: archive hash does not match package provenance (${entry.provenanceIssue})`,
          );
          continue;
        case "manifest-mismatch":
          addIssue(
            entry,
            "manifest-mismatch",
            `${entry.file}: package provenance does not match archive name (${entry.provenanceIssue})`,
          );
          continue;
      }

      const metadata = this.readArchiveProvenance(entry.path);
      if (!metadata.ok) continue;

      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "bpl-cache-verify-"),
      );

      try {
        this.validatePackageArchiveMembers(entry.path);
        const archiveTool = getPackageArchiveTool();
        const extractResult = spawnSync(
          archiveTool,
          ["-xzf", entry.path, "-C", tempDir],
          { stdio: "pipe", timeout: getPackageArchiveToolTimeoutMs() },
        );

        if (extractResult.status !== 0) {
          const detail = this.formatSpawnFailure(
            extractResult,
            "unknown tar error",
          );
          throw new Error(`failed to extract archive (${detail})`);
        }

        const packageDir = path.join(tempDir, "package");
        this.validateExtractedPackageTree(packageDir, entry.path);
        const manifest = this.loadManifest(packageDir);
        const provenance = metadata.provenance;

        if (
          manifest.name !== provenance.name ||
          manifest.version !== provenance.version
        ) {
          addIssue(
            entry,
            "manifest-mismatch",
            `${entry.file}: extracted manifest declares ${manifest.name}@${manifest.version}, provenance declares ${provenance.name}@${provenance.version}`,
          );
          continue;
        }

        const packageHash = this.calculatePackageHash(packageDir);
        if (packageHash !== provenance.packageHash) {
          addIssue(
            entry,
            "package-hash-mismatch",
            `${entry.file}: extracted package hash is ${packageHash}, provenance has ${provenance.packageHash}`,
          );
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        addIssue(
          entry,
          "invalid-archive",
          `${entry.file}: invalid package archive (${detail})`,
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

    const ok = issues.length === 0;

    return createJsonReport(CLI_JSON_CHECKS.packageCacheVerify, ok, {
      ok,
      entriesChecked: entries.length,
      issues,
    });
  }

  repairPackageCache(
    packageName?: string,
    options: { version?: string; dryRun?: boolean } = {},
  ): PackageCacheRepairResult {
    validatePackageCacheVersionFilter(options.version);

    const entries = this.listPackageCache(packageName).filter((entry) =>
      options.version ? entry.version === options.version : true,
    );
    const repaired: PackageCacheEntry[] = [];
    const unchanged: PackageCacheEntry[] = [];
    const issues: PackageCacheVerificationIssue[] = [];

    const addIssue = (
      entry: PackageCacheEntry,
      kind: PackageCacheVerificationIssueKind,
      message: string,
      provenancePath: string | undefined = entry.provenancePath,
    ) => {
      issues.push({
        packageName: entry.name,
        version: entry.version,
        kind,
        message,
        path: entry.path,
        provenancePath,
      });
    };

    for (const entry of entries) {
      if (entry.provenanceStatus === "verified") {
        unchanged.push(entry);
        continue;
      }

      if (
        entry.provenanceStatus !== "missing" &&
        entry.provenanceStatus !== "invalid"
      ) {
        addIssue(
          entry,
          entry.provenanceStatus,
          `${entry.file}: refusing to repair suspicious provenance state (${entry.provenanceIssue})`,
        );
        continue;
      }

      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "bpl-cache-repair-"),
      );

      try {
        this.validatePackageArchiveMembers(entry.path);
        const archiveTool = getPackageArchiveTool();
        const extractResult = spawnSync(
          archiveTool,
          ["-xzf", entry.path, "-C", tempDir],
          { stdio: "pipe", timeout: getPackageArchiveToolTimeoutMs() },
        );

        if (extractResult.status !== 0) {
          const detail = this.formatSpawnFailure(
            extractResult,
            "unknown tar error",
          );
          throw new Error(`failed to extract archive (${detail})`);
        }

        const packageDir = path.join(tempDir, "package");
        this.validateExtractedPackageTree(packageDir, entry.path);
        const manifest = this.loadManifest(packageDir);

        if (manifest.name !== entry.name || manifest.version !== entry.version) {
          addIssue(
            entry,
            "manifest-mismatch",
            `${entry.file}: extracted manifest declares ${manifest.name}@${manifest.version}`,
          );
          continue;
        }

        if (!options.dryRun) {
          const provenanceIssue = this.getUnsafeProvenancePathIssue(
            entry.provenancePath,
          );
          if (provenanceIssue) {
            addIssue(
              entry,
              "invalid-provenance",
              `${entry.file}: refusing to repair unsafe package provenance (${provenanceIssue})`,
            );
            continue;
          }

          this.writeArchiveProvenance(entry.path, packageDir, manifest);
        }
        repaired.push(entry);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        addIssue(
          entry,
          "invalid-archive",
          `${entry.file}: invalid package archive (${detail})`,
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }

    return createJsonReport(
      CLI_JSON_CHECKS.packageCacheRepair,
      issues.length === 0,
      {
        dryRun: Boolean(options.dryRun),
        repaired,
        unchanged,
        issues,
      },
    );
  }

  private getUnsafeProvenancePathIssue(provenancePath: string): string | null {
    const provenanceStat = this.tryLstat(provenancePath);
    if (!provenanceStat) return null;
    if (provenanceStat.isSymbolicLink()) {
      return "package provenance path is a symbolic link";
    }
    if (!provenanceStat.isFile()) {
      return "package provenance path is not a file";
    }
    return null;
  }

  repairLockFile(): PackageLockRepairResult {
    const existingLock = this.loadLockFile();
    const nextLock: PackageLockFile = { lockfileVersion: 1, packages: {} };
    const updated: string[] = [];
    const installedPackages = this.list({ global: false }).sort(
      (left, right) =>
        left.manifest.name.localeCompare(right.manifest.name) ||
        left.path.localeCompare(right.path),
    );
    const duplicateIssues = this.findDuplicateLockRepairIssues(
      installedPackages,
    );

    if (duplicateIssues.length > 0) {
      const verification: PackageLockVerification = {
        ok: false,
        errors: duplicateIssues.map((issue) => issue.message),
        issues: duplicateIssues,
        packagesChecked: installedPackages.length,
      };
      throw new PackageLockVerificationError(
        verification,
        this.getLockFilePath(),
        "Keep only one installed directory for each package name, then rerun 'bpl install --repair-lock'.",
      );
    }

    for (const pkg of installedPackages) {
      const existing = existingLock.packages[pkg.manifest.name];
      const nextEntry = {
        version: pkg.manifest.version,
        source:
          existing?.source ?? `${pkg.manifest.name}-${pkg.manifest.version}.tgz`,
        hash: pkg.hash,
      };

      nextLock.packages[pkg.manifest.name] = nextEntry;

      if (
        !existing ||
        existing.version !== nextEntry.version ||
        existing.source !== nextEntry.source ||
        existing.hash !== nextEntry.hash
      ) {
        updated.push(pkg.manifest.name);
      }
    }

    const installedNames = new Set(
      installedPackages.map((pkg) => pkg.manifest.name),
    );
    const removed = Object.keys(existingLock.packages)
      .filter((packageName) => !installedNames.has(packageName))
      .sort((left, right) => left.localeCompare(right));

    this.saveLockFile(nextLock);

    return {
      packages: installedPackages.length,
      updated,
      removed,
    };
  }

  private findDuplicateLockRepairIssues(
    installedPackages: readonly PackageInfo[],
  ): PackageLockVerificationIssue[] {
    return this.findDuplicateInstalledPackageNameIssues(installedPackages).map(
      (issue) => ({
        packageName: issue.packageName,
        kind: issue.kind,
        message: issue.message,
        packagePath: issue.path,
        paths: issue.paths,
      }),
    );
  }

  private findDuplicateInstalledPackageNameIssues(
    installedPackages: readonly PackageInfo[],
  ): PackageInstalledNameIssue[] {
    const packagesByName = new Map<string, string[]>();

    for (const pkg of installedPackages) {
      const paths = packagesByName.get(pkg.manifest.name) ?? [];
      paths.push(pkg.path);
      packagesByName.set(pkg.manifest.name, paths);
    }

    const issues: PackageInstalledNameIssue[] = [];
    for (const [packageName, paths] of packagesByName.entries()) {
      if (paths.length <= 1) continue;
      const sortedPaths = paths.sort((left, right) => left.localeCompare(right));
      issues.push({
        packageName,
        kind: "duplicate-installed-package",
        message: `Multiple installed directories declare package '${packageName}': ${sortedPaths.join(", ")}`,
        path: sortedPaths.join(", "),
        paths: sortedPaths,
      });
    }

    return issues.sort((left, right) =>
      left.packageName.localeCompare(right.packageName),
    );
  }

  doctorPackages(): PackageDoctorReport {
    const issues: PackageDoctorIssue[] = [];
    let manifest: PackageManifest | undefined;

    try {
      manifest = this.loadManifest(this.projectRoot);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      issues.push({
        severity: "warning",
        kind: "manifest",
        message: `No valid project package manifest: ${detail}`,
        path: path.join(this.projectRoot, "bpl.json"),
        hint: "Run 'bpl init' when this directory should be a package project.",
      });
    }

    const lockPath = this.getLockFilePath();
    const lockExists = Boolean(this.tryLstat(lockPath));
    let lock: PackageLockFile | null = null;
    let lockLoadError: string | null = null;

    if (lockExists) {
      try {
        lock = this.loadLockFile();
      } catch (error) {
        lockLoadError = error instanceof Error ? error.message : String(error);
        const code =
          error instanceof CompilerError ? error.code : undefined;
        issues.push({
          severity: "error",
          kind: "invalid-lockfile",
          ...(code ? { code } : {}),
          message: `Invalid bpl.lock: ${lockLoadError}`,
          path: lockPath,
          hint: "Fix bpl.lock JSON syntax or regenerate it with 'bpl install'.",
        });
      }
    }
    const dependencyCount = manifest
      ? Object.keys({
          ...manifest.dependencies,
          ...manifest.devDependencies,
        }).length
      : 0;

    let lockVerified = !lockExists && dependencyCount === 0;
    if (lockExists && !lockLoadError) {
      const verification = this.verifyLockFile();
      lockVerified = verification.ok;
      for (const issue of verification.issues) {
        issues.push({
          severity: "error",
          kind: this.formatDoctorLockVerificationKind(issue),
          code: PACKAGE_INSTALL_LOCK_VERIFY_FAILED_CODE,
          message: issue.message,
          path: issue.packagePath,
          hint: this.formatLockVerificationHelp(verification),
          packageName: issue.packageName,
          ...(issue.source ? { source: issue.source } : {}),
          ...(issue.expectedVersion
            ? { expectedVersion: issue.expectedVersion }
            : {}),
          ...(issue.actualVersion ? { actualVersion: issue.actualVersion } : {}),
          ...(issue.expectedName ? { expectedName: issue.expectedName } : {}),
          ...(issue.actualName ? { actualName: issue.actualName } : {}),
          ...(issue.expectedHash ? { expectedHash: issue.expectedHash } : {}),
          ...(issue.actualHash ? { actualHash: issue.actualHash } : {}),
          ...(issue.dependencyOf ? { dependencyOf: issue.dependencyOf } : {}),
          ...(issue.requestedSource
            ? { requestedSource: issue.requestedSource }
            : {}),
          lockVerificationKind: issue.kind,
        });
      }
    } else if (!lockExists && dependencyCount > 0) {
      issues.push({
        severity: "error",
        kind: "missing-lockfile",
        message: "Project has dependencies but no bpl.lock.",
        path: lockPath,
        hint: "Run 'bpl install' and commit bpl.lock for reproducible installs.",
      });
    }

    let installedPackages: PackageInfo[] = [];
    let localPackageDirectoryReadable = true;
    try {
      installedPackages = this.list({ global: false });
      issues.push(...this.findInstalledPackageNameIssues());
    } catch (error) {
      localPackageDirectoryReadable = false;
      issues.push(
        this.formatUnsafePackageDirectoryIssue(
          error,
          this.localPackageDir,
          "Local package directory",
        ),
      );
    }

    let dependencyTree: PackageDependencyTreeNode[] = [];
    if (localPackageDirectoryReadable) {
      try {
        dependencyTree = this.getDependencyTree({ global: false });
        for (const nodeIssue of collectDependencyTreeIssues(dependencyTree)) {
          issues.push(nodeIssue);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        issues.push({
          severity: "error",
          kind: "dependency-tree",
          message: `Unable to build dependency tree: ${detail}`,
          path: this.projectRoot,
          hint: "Fix bpl.json and bpl.lock, then rerun 'bpl doctor packages'.",
        });
      }
    }

    let cacheEntries: PackageCacheEntry[] = [];
    let cacheVerification: PackageCacheVerificationReport = createJsonReport(
      CLI_JSON_CHECKS.packageCacheVerify,
      true,
      {
        ok: true,
        entriesChecked: 0,
        issues: [],
      },
    );
    try {
      cacheEntries = this.listPackageCache();
      cacheVerification = this.verifyPackageCache();
    } catch (error) {
      cacheVerification = createJsonReport(
        CLI_JSON_CHECKS.packageCacheVerify,
        false,
        {
          ok: false,
          entriesChecked: 0,
          issues: [],
        },
      );
      issues.push(
        this.formatUnsafePackageDirectoryIssue(
          error,
          this.globalPackageDir,
          "Global package directory",
        ),
      );
    }
    for (const issue of cacheVerification.issues) {
      issues.push({
        severity: "warning",
        kind: `package-cache-${issue.kind}`,
        message: issue.message,
        path: issue.path,
        ...(issue.provenancePath
          ? { provenancePath: issue.provenancePath }
          : {}),
        hint: `Run 'bpl package-cache verify ${issue.packageName}' for details, or remove stale archives with 'bpl package-cache clean ${issue.packageName} --package-version ${issue.version}'.`,
      });
    }

    const errorCount = issues.filter((issue) => issue.severity === "error")
      .length;

    const ok = errorCount === 0;

    return createJsonReport(CLI_JSON_CHECKS.packages, ok, {
      ok,
      projectRoot: this.projectRoot,
      localPackageDir: this.localPackageDir,
      globalPackageDir: this.globalPackageDir,
      ...(manifest ? { manifest } : {}),
      lockfile: {
        path: lockPath,
        exists: lockExists,
        packages: lock ? Object.keys(lock.packages).length : 0,
        verified: lockVerified,
      },
      installedPackages,
      cacheEntries,
      cacheVerification,
      dependencyTree,
      issues,
    });
  }

  private formatDoctorLockVerificationKind(
    issue: PackageLockVerificationIssue,
  ): string {
    if (issue.kind === "missing-package") {
      return "stale-lock-entry";
    }
    return issue.kind;
  }

  private formatUnsafePackageDirectoryIssue(
    error: unknown,
    dirPath: string,
    label: string,
  ): PackageDoctorIssue {
    const detail = error instanceof Error ? error.message : String(error);
    const code = error instanceof CompilerError ? error.code : undefined;
    return {
      severity: "error",
      kind: "unsafe-package-directory",
      ...(code ? { code } : {}),
      message: `${label} is not safe to read: ${detail}`,
      path: dirPath,
      hint: "Move the unsafe package directory out of the way, then rerun 'bpl doctor packages'.",
    };
  }

  private findInstalledPackageNameIssues(): PackageDoctorIssue[] {
    if (
      !this.readPackageManagerDirectoryStats(
        this.localPackageDir,
        "Local package directory",
      )
    ) {
      return [];
    }

    const issues: PackageDoctorIssue[] = [];
    const seen = new Map<string, string[]>();

    const items = fs
      .readdirSync(this.localPackageDir)
      .sort((left, right) => left.localeCompare(right));

    for (const item of items) {
      const packagePath = path.join(this.localPackageDir, item);
      const stat = this.tryLstat(packagePath);
      if (!stat?.isDirectory()) continue;

      try {
        const manifest = this.loadManifest(packagePath);
        if (manifest.name !== item) {
          issues.push({
            severity: "error",
            kind: "package-name-mismatch",
            message: `Installed directory '${item}' contains package '${manifest.name}'.`,
            path: path.join(packagePath, "bpl.json"),
            hint: "Reinstall the package so bpl_modules directory names match manifest names.",
          });
        }

        const entries = seen.get(manifest.name) || [];
        entries.push(packagePath);
        seen.set(manifest.name, entries);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        issues.push({
          severity: "error",
          kind: "invalid-installed-package",
          message: `${item}: invalid installed package (${detail})`,
          path: packagePath,
          hint: "Remove or reinstall the invalid package directory.",
        });
      }
    }

    for (const [packageName, paths] of seen.entries()) {
      if (paths.length <= 1) continue;
      const sortedPaths = paths.sort((left, right) => left.localeCompare(right));
      issues.push({
        severity: "error",
        kind: "duplicate-installed-package",
        message: `Multiple installed directories declare package '${packageName}'.`,
        path: sortedPaths.join(", "),
        paths: sortedPaths,
        hint: "Keep only one installed directory for each package name.",
      });
    }

    return issues.sort((left, right) =>
      [
        left.kind.localeCompare(right.kind),
        (left.packageName ?? "").localeCompare(right.packageName ?? ""),
        (left.path ?? "").localeCompare(right.path ?? ""),
        left.message.localeCompare(right.message),
      ].find((comparison) => comparison !== 0) ?? 0,
    );
  }

  getDependencyTree(
    options: PackageOptionsGlobal = { global: false },
  ): PackageDependencyTreeNode[] {
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    this.readPackageManagerDirectoryStats(
      targetDir,
      options.global ? "Global package directory" : "Local package directory",
    );

    const lock =
      !options.global && this.tryLstat(this.getLockFilePath())
        ? this.loadLockFile()
        : null;
    const rootDependencySpecs = options.global
      ? {}
      : this.loadProjectDependencySpecs();
    const installedPackages = this.listUniqueInstalledPackages(options);
    const rootNames = new Set<string>();

    for (const packageName of Object.keys(rootDependencySpecs)) {
      rootNames.add(packageName);
    }

    if (rootNames.size === 0 && lock) {
      for (const packageName of Object.keys(lock.packages)) {
        rootNames.add(packageName);
      }
    }

    if (rootNames.size === 0) {
      for (const pkg of installedPackages) {
        rootNames.add(pkg.manifest.name);
      }
    }

    return [...rootNames]
      .sort((left, right) => left.localeCompare(right))
      .map((packageName) =>
        this.buildDependencyTreeNode(
          packageName,
          options,
          [],
          rootDependencySpecs[packageName],
          lock,
        ),
      );
  }

  private loadProjectDependencySpecs(): Record<string, string> {
    const manifestPath = path.join(this.projectRoot, "bpl.json");
    if (!fs.existsSync(manifestPath)) {
      return {};
    }

    try {
      const manifest = this.loadManifest(this.projectRoot);
      return {
        ...manifest.dependencies,
        ...manifest.devDependencies,
      };
    } catch {
      return {};
    }
  }

  private buildDependencyTreeNode(
    packageName: string,
    options: PackageOptionsGlobal,
    ancestors: string[],
    requestedSource?: string,
    lock?: PackageLockFile | null,
  ): PackageDependencyTreeNode {
    const cycleStart = ancestors.indexOf(packageName);
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    const packagePath = path.join(targetDir, packageName);
    const packageRootStats = this.tryLstat(packagePath);
    const packagePathExists = Boolean(packageRootStats);
    const installed = Boolean(packageRootStats?.isDirectory());
    const lockEntry = lock?.packages[packageName];

    if (cycleStart !== -1) {
      const cycle = [...ancestors.slice(cycleStart), packageName].join(" -> ");
      return {
        name: packageName,
        version: lockEntry?.version,
        source: requestedSource ?? lockEntry?.source,
        path: packagePathExists ? packagePath : undefined,
        installed,
        locked: Boolean(lockEntry),
        dependencies: [],
        problems: [`cycle detected: ${cycle}`],
      };
    }

    const problems: string[] = [];
    let manifest: PackageManifest | undefined;

    if (!packageRootStats) {
      problems.push(
        `missing from ${options.global ? "global package directory" : "bpl_modules"}`,
      );
    } else if (packageRootStats.isSymbolicLink()) {
      problems.push(`package root is a symbolic link: ${packagePath}`);
    } else if (!packageRootStats.isDirectory()) {
      problems.push(`package root is not a directory: ${packagePath}`);
    } else {
      try {
        manifest = this.loadManifest(packagePath);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        problems.push(`invalid manifest: ${detail}`);
      }
    }

    const nextAncestors = [...ancestors, packageName];
    const dependencies = Object.entries(manifest?.dependencies || {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dependencyName, dependencySource]) =>
        this.buildDependencyTreeNode(
          dependencyName,
          options,
          nextAncestors,
          dependencySource,
          lock,
        ),
      );

    return {
      name: packageName,
      version: manifest?.version ?? lockEntry?.version,
      source: requestedSource ?? lockEntry?.source,
      path: packagePathExists ? packagePath : undefined,
      installed,
      locked: Boolean(lockEntry),
      dependencies,
      problems,
    };
  }

  /**
   * Resolve a package import path
   */
  resolvePackage(packageName: string, projectRoot?: string): string | null {
    return this.resolvePackageWithDiagnostics(packageName, projectRoot).result
      ?.filePath ?? null;
  }

  resolvePackageWithDiagnostics(
    packageName: string,
    projectRoot?: string,
  ): PackageResolutionDetails {
    return resolvePackageImport(packageName, projectRoot || process.cwd(), {
      globalPackageDir: this.globalPackageDir,
    });
  }

  /**
   * Initialize a new BPL project
   */
  init(dir: string, name?: string): PackageInitResult {
    const manifestPath = path.join(dir, "bpl.json");
    const location: SourceLocation = {
      file: manifestPath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    };

    if (this.tryLstat(manifestPath)) {
      throw new CompilerError(
        `bpl.json already exists in ${dir}`,
        "Delete the existing bpl.json if you want to re-initialize.",
        location,
        PACKAGE_INIT_MANIFEST_EXISTS_CODE,
      );
    }

    const packageName =
      name !== undefined ? name : defaultPackageNameFromDirectory(dir);
    validatePackageName(
      packageName,
      location,
      PACKAGE_INIT_NAME_INVALID_CODE,
    );

    const manifest: PackageManifest = {
      name: packageName,
      version: "1.0.0",
      description: "A BPL project",
      main: "index.bpl",
      dependencies: {},
      devDependencies: {},
    };

    this.writeFileAtomically(manifestPath, JSON.stringify(manifest, null, 2));
    return { manifest, manifestPath };
  }
}

function validatePackageName(
  name: string,
  location: SourceLocation,
  code?: string,
): void {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new CompilerError(
      `Invalid package name: ${name} (use lowercase letters, numbers, and hyphens only)`,
      "Use a package-safe name such as 'my-package'.",
      location,
      code,
    );
  }
}

function validatePackageCacheVersionFilter(version: string | undefined): void {
  if (version === undefined) return;

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new CompilerError(
      `Invalid package cache version filter: ${version}`,
      "Use an exact semantic version such as '1.2.3'.",
      {
        file: "package-cache",
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
      PACKAGE_CACHE_VERSION_INVALID_CODE,
    );
  }
}

function validatePackageCachePackageNameFilter(
  packageName: string | undefined,
): void {
  if (packageName === undefined) return;

  validatePackageName(
    packageName,
    {
      file: "package-cache",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    },
    PACKAGE_CACHE_NAME_INVALID_CODE,
  );
}

function defaultPackageNameFromDirectory(dir: string): string {
  const normalized = path
    .basename(dir)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "bpl-project";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePackageTarballName(
  file: string,
): { name: string; version: string } | null {
  const match = /^(.+)-(\d+\.\d+\.\d+)\.tgz$/.exec(file);
  if (!match) return null;
  return {
    name: match[1]!,
    version: match[2]!,
  };
}

function parsePackageInstallSpec(
  value: string,
): { name: string; versionSpec: string } | null {
  const match = /^([a-z0-9-]+)@(.+)$/.exec(value);
  if (!match) return null;
  return {
    name: match[1]!,
    versionSpec: match[2]!,
  };
}

function parseSemverTuple(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionSelectorSpec(value: string): boolean {
  if (value === "*" || value === "latest") return true;
  if (/^\d+\.\d+\.\d+$/.test(value)) return true;
  if (/^[~^]\d+\.\d+\.\d+$/.test(value)) return true;
  if (/^(>=|>|<=|<|=)\d+\.\d+\.\d+$/.test(value)) return true;
  return /^(>=|>|<=|<|=)?\d+\.\d+\.\d+(\s+(>=|>|<=|<|=)?\d+\.\d+\.\d+)+$/.test(
    value,
  );
}

function satisfiesVersionSelector(version: string, selector: string): boolean {
  if (selector === "*" || selector === "latest") return true;
  if (/^\d+\.\d+\.\d+$/.test(selector)) return version === selector;

  const versionTuple = parseSemverTuple(version);

  if (selector.startsWith("^")) {
    const minimum = parseSemverTuple(selector.slice(1));
    let maximum: [number, number, number];
    if (minimum[0] > 0) {
      maximum = [minimum[0] + 1, 0, 0];
    } else if (minimum[1] > 0) {
      maximum = [0, minimum[1] + 1, 0];
    } else {
      maximum = [0, 0, minimum[2] + 1];
    }
    return (
      compareSemverTuple(versionTuple, minimum) >= 0 &&
      compareSemverTuple(versionTuple, maximum) < 0
    );
  }

  if (selector.startsWith("~")) {
    const minimum = parseSemverTuple(selector.slice(1));
    const maximum: [number, number, number] = [
      minimum[0],
      minimum[1] + 1,
      0,
    ];
    return (
      compareSemverTuple(versionTuple, minimum) >= 0 &&
      compareSemverTuple(versionTuple, maximum) < 0
    );
  }

  return selector
    .trim()
    .split(/\s+/)
    .every((comparator) =>
      satisfiesVersionComparator(versionTuple, comparator),
    );
}

function satisfiesVersionComparator(
  version: [number, number, number],
  comparator: string,
): boolean {
  const match = /^(>=|>|<=|<|=)?(\d+\.\d+\.\d+)$/.exec(comparator);
  if (!match) return false;

  const operator = match[1] || "=";
  const target = parseSemverTuple(match[2]!);
  const comparison = compareSemverTuple(version, target);

  switch (operator) {
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    case "=":
      return comparison === 0;
    default:
      return false;
  }
}

function compareSemverTuple(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    const delta = left[i]! - right[i]!;
    if (delta !== 0) return delta;
  }

  return 0;
}

function compareSemverDesc(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    const delta = right[i]! - left[i]!;
    if (delta !== 0) return delta;
  }

  return 0;
}

function collectDependencyTreeIssues(
  nodes: PackageDependencyTreeNode[],
): PackageDoctorIssue[] {
  const issues: PackageDoctorIssue[] = [];

  const visit = (node: PackageDependencyTreeNode) => {
    for (const problem of node.problems) {
      issues.push({
        severity: "error",
        kind: "dependency-tree",
        message: `${node.name}: ${problem}`,
        path: node.path,
        hint: "Run 'bpl install' to restore dependencies or fix bpl.json.",
      });
    }

    for (const dependency of node.dependencies) {
      visit(dependency);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return issues;
}

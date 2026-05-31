/**
 * Clean Command Handler
 * Removes build artifacts and caches
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { Command } from "commander";
import {
  getPositiveIntegerEnv,
  TIMEOUT_ENV_DEFAULTS,
} from "../../compiler/common/Env";
import { Logger } from "../../compiler/common/Logger";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import { findSymlinkedPathComponent } from "../../compiler/common/PathSafety";

const log = new Logger("Clean");
const CLEAN_GIT_TIMEOUT_MS = TIMEOUT_ENV_DEFAULTS.BPL_CLEAN_GIT_TIMEOUT_MS;

export const CLEAN_WORKDIR_SYMLINK_CODE = "BPL_CLEAN_WORKDIR_SYMLINK";
export const CLEAN_GIT_TRACKED_UNAVAILABLE_CODE =
  "BPL_CLEAN_GIT_TRACKED_UNAVAILABLE";

interface CleanEntry {
  path: string;
  type: "file" | "directory" | "symlink";
}

interface CleanReport {
  schemaVersion: 1;
  check: "clean";
  success: boolean;
  dryRun: boolean;
  count: number;
  entries: CleanEntry[];
}

class CleanValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CleanValidationError";
  }
}

/**
 * Register the clean command
 *
 * The `clean` command removes build artifacts like .ll files, compiled binaries,
 * and cache directories. It helps start fresh when needed.
 *
 * Examples:
 *   bpl clean
 *   bpl clean -v
 *   bpl clean --dry-run
 */
export function registerCleanCommand(program: Command): void {
  program
    .command("clean")
    .description("Remove build artifacts and caches")
    .option("-v, --verbose", "enable verbose output")
    .option("--dry-run", "show what would be deleted without actually deleting")
    .option("--json", "output machine-readable cleanup report")
    .action(
      (
        options: { verbose?: boolean; dryRun?: boolean; json?: boolean },
        command: Command,
      ) => {
        let outputJson = false;
        try {
          const cwd = process.cwd();
          const globalOpts = command.parent?.opts() || {};
          outputJson = Boolean(options.json || globalOpts.json);
          assertNoSymlinkedWorkingDirectoryPath(cwd);
          const entriesToDelete: CleanEntry[] = [];
          const trackedPaths = getGitTrackedPaths(cwd);
          if (!trackedPaths) {
            throw new CleanValidationError(
              "Could not determine git-tracked files; refusing to clean in a git repository.",
              CLEAN_GIT_TRACKED_UNAVAILABLE_CODE,
            );
          }
          const trackedPathSet = trackedPaths;
          const cacheDirs = [
            path.join(cwd, ".bpl-cache"),
            path.join(cwd, "build"),
            path.join(cwd, "dist"),
          ];
          const topLevelCacheDirs = new Set(
            cacheDirs.map((dir) => path.resolve(dir)),
          );

          // Find all matching files recursively
          function findFiles(dir: string, depth = 0): void {
            if (depth > 10) return; // Prevent too deep recursion

            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });

              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(cwd, fullPath);
                const resolvedPath = path.resolve(fullPath);
                const gitRelativePath = normalizeGitRelativePath(relativePath);
                const isTopLevelCacheDir =
                  entry.isDirectory() && topLevelCacheDirs.has(resolvedPath);
                const isHiddenNonCacheEntry =
                  entry.name.startsWith(".") && !isTopLevelCacheDir;

                // Skip node_modules, .git, bpl_modules
                if (
                  entry.name === "node_modules" ||
                  entry.name === ".git" ||
                  entry.name === "bpl_modules" ||
                  isHiddenNonCacheEntry ||
                  (isTopLevelCacheDir &&
                    !hasTrackedPathUnder(trackedPathSet, gitRelativePath))
                ) {
                  continue;
                }

                if (entry.isDirectory()) {
                  findFiles(fullPath, depth + 1);
                } else if (entry.isFile() || entry.isSymbolicLink()) {
                  // Check if file matches any pattern
                  const ext = path.extname(entry.name);
                  const base = path.basename(entry.name, ext);

                  if (
                    isBuildArtifact(base, ext) &&
                    !trackedPathSet.has(gitRelativePath)
                  ) {
                    const entryType = entry.isSymbolicLink()
                      ? "symlink"
                      : "file";
                    entriesToDelete.push({
                      path: relativePath,
                      type: entryType,
                    });

                    if (!outputJson && (options.verbose || options.dryRun)) {
                      log.info(
                        options.dryRun
                          ? `Would delete: ${relativePath}`
                          : `Deleting: ${relativePath}`,
                      );
                    }

                    if (!options.dryRun) {
                      fs.rmSync(fullPath, { force: true });
                    }
                  }
                }
              }
            } catch (e) {
              // Skip directories we can't read
            }
          }

          // Start searching from current directory
          findFiles(cwd);

          for (const dir of cacheDirs) {
            const stats = tryLstat(dir);
            if (stats) {
              const relativePath = path.relative(cwd, dir);
              const gitRelativePath = normalizeGitRelativePath(relativePath);
              if (hasTrackedPathUnder(trackedPathSet, gitRelativePath)) {
                continue;
              }
              const isDirectory = stats.isDirectory();
              const isSymlink = stats.isSymbolicLink();
              const reportPath = isDirectory
                ? `${relativePath}/`
                : relativePath;
              const entryType: CleanEntry["type"] = isSymlink
                ? "symlink"
                : isDirectory
                  ? "directory"
                  : "file";

              entriesToDelete.push({
                path: reportPath,
                type: entryType,
              });

              if (!outputJson && (options.verbose || options.dryRun)) {
                log.info(
                  options.dryRun
                    ? `Would delete: ${reportPath}`
                    : `Deleting: ${reportPath}`,
                );
              }

              if (!options.dryRun) {
                fs.rmSync(dir, { recursive: isDirectory, force: true });
              }
            }
          }

          const report: CleanReport = createJsonReport(
            CLI_JSON_CHECKS.clean,
            true,
            {
              dryRun: Boolean(options.dryRun),
              count: entriesToDelete.length,
              entries: entriesToDelete,
            },
          );

          if (outputJson) {
            console.log(JSON.stringify(report, null, 2));
            return;
          }

          // Summary
          if (options.dryRun) {
            if (entriesToDelete.length === 0) {
              log.info("\nNo build artifacts found");
            } else {
              log.info(
                `\nWould delete ${entriesToDelete.length} file(s) and directory(s)`,
              );
            }
          } else {
            if (entriesToDelete.length === 0) {
              log.info("No build artifacts found");
            } else {
              log.info(
                `\n✓ Cleaned ${entriesToDelete.length} file(s) and directory(s)`,
              );
            }
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.clean, false, {
                  dryRun: Boolean(options.dryRun),
                  count: 0,
                  entries: [] as CleanEntry[],
                  error: message,
                  ...formatCleanJsonErrorCode(e),
                }),
                null,
                2,
              ),
            );
          } else {
            log.error(message);
          }
          process.exit(1);
        }
      },
    );
}

function assertNoSymlinkedWorkingDirectoryPath(cwd: string): void {
  const symlinkedPath = findSymlinkedPathComponent(cwd);
  if (!symlinkedPath) return;

  throw new CleanValidationError(
    `Clean working directory path contains a symbolic link: ${symlinkedPath}. Run bpl clean from the real project path.`,
    CLEAN_WORKDIR_SYMLINK_CODE,
  );
}

function formatCleanJsonErrorCode(
  error: unknown,
): { errorCode: string } | Record<string, never> {
  if (error instanceof CleanValidationError) {
    return { errorCode: error.code };
  }

  return {};
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

function isBuildArtifact(base: string, ext: string): boolean {
  return (
    ext === ".ll" ||
    ext === ".o" ||
    ext === ".exe" ||
    ext === ".out" ||
    (base === "main" && ext === "") ||
    (base === "a" && ext === ".out")
  );
}

function getGitTrackedPaths(cwd: string): Set<string> | null {
  const result = spawnSync("git", ["-C", cwd, "ls-files", "-z", "--", "."], {
    encoding: "utf-8",
    timeout: getCleanGitTimeoutMs(),
  });

  if (result.status !== 0 || result.error) {
    return findGitRepositoryMarker(cwd) ? null : new Set();
  }

  return new Set(
    result.stdout
      .split("\0")
      .filter(Boolean)
      .map((trackedPath) => normalizeGitRelativePath(trackedPath)),
  );
}

function getCleanGitTimeoutMs(): number {
  return getPositiveIntegerEnv(
    "BPL_CLEAN_GIT_TIMEOUT_MS",
    CLEAN_GIT_TIMEOUT_MS,
    {
      warn: (message) => log.warn(message),
    },
  );
}

function findGitRepositoryMarker(startDir: string): string | null {
  let current = path.resolve(startDir);

  while (true) {
    const marker = path.join(current, ".git");
    if (fs.existsSync(marker)) {
      return marker;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function normalizeGitRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function hasTrackedPathUnder(
  trackedPaths: Set<string>,
  directory: string,
): boolean {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  for (const trackedPath of trackedPaths) {
    if (trackedPath === directory || trackedPath.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

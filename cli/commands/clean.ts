/**
 * Clean Command Handler
 * Removes build artifacts and caches
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { Command } from "commander";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("Clean");

interface CleanEntry {
  path: string;
  type: "file" | "directory";
}

interface CleanReport {
  dryRun: boolean;
  count: number;
  entries: CleanEntry[];
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
        try {
          const cwd = process.cwd();
          const globalOpts = command.parent?.opts() || {};
          const outputJson = options.json || globalOpts.json;
          const entriesToDelete: CleanEntry[] = [];
          const trackedPaths = getGitTrackedPaths(cwd);
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
                    !hasTrackedPathUnder(trackedPaths, gitRelativePath))
                ) {
                  continue;
                }

                if (entry.isDirectory()) {
                  findFiles(fullPath, depth + 1);
                } else if (entry.isFile()) {
                  // Check if file matches any pattern
                  const ext = path.extname(entry.name);
                  const base = path.basename(entry.name, ext);

                  if (
                    isBuildArtifact(base, ext) &&
                    !trackedPaths.has(gitRelativePath)
                  ) {
                    entriesToDelete.push({ path: relativePath, type: "file" });

                    if (!outputJson && (options.verbose || options.dryRun)) {
                      log.info(
                        options.dryRun
                          ? `Would delete: ${relativePath}`
                          : `Deleting: ${relativePath}`,
                      );
                    }

                    if (!options.dryRun) {
                      fs.unlinkSync(fullPath);
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
            if (fs.existsSync(dir)) {
              const relativePath = path.relative(cwd, dir);
              const gitRelativePath = normalizeGitRelativePath(relativePath);
              if (hasTrackedPathUnder(trackedPaths, gitRelativePath)) {
                continue;
              }

              entriesToDelete.push({
                path: `${relativePath}/`,
                type: "directory",
              });

              if (!outputJson && (options.verbose || options.dryRun)) {
                log.info(
                  options.dryRun
                    ? `Would delete: ${relativePath}/`
                    : `Deleting: ${relativePath}/`,
                );
              }

              if (!options.dryRun) {
                fs.rmSync(dir, { recursive: true, force: true });
              }
            }
          }

          const report: CleanReport = {
            dryRun: Boolean(options.dryRun),
            count: entriesToDelete.length,
            entries: entriesToDelete,
          };

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
          log.error(`${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
      },
    );
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

function getGitTrackedPaths(cwd: string): Set<string> {
  const result = spawnSync("git", ["-C", cwd, "ls-files", "-z", "--", "."], {
    encoding: "utf-8",
  });

  if (result.status !== 0 || result.error) {
    return new Set();
  }

  return new Set(
    result.stdout
      .split("\0")
      .filter(Boolean)
      .map((trackedPath) => normalizeGitRelativePath(trackedPath)),
  );
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

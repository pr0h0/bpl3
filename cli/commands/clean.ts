/**
 * Clean Command Handler
 * Removes build artifacts and caches
 */

import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("Clean");

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
    .action((options: { verbose?: boolean; dryRun?: boolean }) => {
      try {
        const cwd = process.cwd();
        let deletedCount = 0;
        const filesToDelete: string[] = [];

        // Patterns to match for deletion
        const patterns = [
          "**/*.ll", // LLVM IR files
          "**/*.o", // Object files
          "**/main", // Common binary name
          "**/a.out", // Default binary name
          "**/*.exe", // Windows executables
          "**/*.out", // Unix executables
        ];

        // Find all matching files recursively
        function findFiles(dir: string, depth = 0): void {
          if (depth > 10) return; // Prevent too deep recursion

          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              const relativePath = path.relative(cwd, fullPath);

              // Skip node_modules, .git, bpl_modules
              if (
                entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === "bpl_modules" ||
                entry.name.startsWith(".")
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
                  ext === ".ll" ||
                  ext === ".o" ||
                  ext === ".exe" ||
                  ext === ".out" ||
                  (base === "main" && ext === "") ||
                  (base === "a" && ext === ".out")
                ) {
                  filesToDelete.push(fullPath);

                  if (options.verbose || options.dryRun) {
                    log.info(
                      options.dryRun
                        ? `Would delete: ${relativePath}`
                        : `Deleting: ${relativePath}`,
                    );
                  }

                  if (!options.dryRun) {
                    fs.unlinkSync(fullPath);
                    deletedCount++;
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

        // Also check for cache directories
        const cacheDirs = [
          path.join(cwd, ".bpl-cache"),
          path.join(cwd, "build"),
          path.join(cwd, "dist"),
        ];

        for (const dir of cacheDirs) {
          if (fs.existsSync(dir)) {
            const relativePath = path.relative(cwd, dir);

            if (options.verbose || options.dryRun) {
              log.info(
                options.dryRun
                  ? `Would delete: ${relativePath}/`
                  : `Deleting: ${relativePath}/`,
              );
            }

            if (!options.dryRun) {
              fs.rmSync(dir, { recursive: true, force: true });
              deletedCount++;
            }
          }
        }

        // Summary
        if (options.dryRun) {
          if (filesToDelete.length === 0) {
            log.info("\nNo build artifacts found");
          } else {
            log.info(
              `\nWould delete ${filesToDelete.length} file(s) and directory(s)`,
            );
          }
        } else {
          if (deletedCount === 0) {
            log.info("No build artifacts found");
          } else {
            log.info(`\n✓ Cleaned ${deletedCount} file(s) and directory(s)`);
          }
        }
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });
}

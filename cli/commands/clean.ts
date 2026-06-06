/**
 * Clean Command Registrar
 * Keeps action-only cleanup dependencies out of CLI help startup.
 */

import type { Command } from "commander";

export {
  CLEAN_GIT_TRACKED_UNAVAILABLE_CODE,
  CLEAN_JSON_ERROR_CODES,
  CLEAN_WORKDIR_SYMLINK_CODE,
} from "./CleanContracts";

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
      async (
        options: { verbose?: boolean; dryRun?: boolean; json?: boolean },
        command: Command,
      ) => {
        const { runCleanCommand } = await import("./cleanAction");
        runCleanCommand(options, command);
      },
    );
}

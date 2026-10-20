/**
 * File Watcher for Watch Mode
 * Monitors BPL source files and triggers recompilation on changes
 */

import * as fs from "fs";
import * as path from "path";
import { processFile } from "./CompilationRunner";
import type { CompileOptions } from "./types";
import { Logger } from "../compiler/common/Logger";
import { createSourceWatcher, type SourceWatcher } from "./SourceWatcher";

const log = new Logger("Watch");

/**
 * Start watching files and recompile on changes
 */
export function watchMode(
  entryFile: string,
  options: CompileOptions,
  programArgs?: string[],
): SourceWatcher {
  const absolutePath = path.resolve(entryFile);

  if (!fs.existsSync(absolutePath)) {
    log.error(`File not found: ${entryFile}`);
    process.exit(1);
  }

  const watchDir = path.dirname(absolutePath);
  const fileName = path.basename(absolutePath);

  log.info("Starting watch mode...");
  log.info(`Watching directory: ${watchDir}`);
  log.info(`Entry point: ${fileName}`);
  log.info("Press Ctrl+C to stop\n");

  // Initial compilation
  compile(absolutePath, options, programArgs);

  const watcher = createSourceWatcher(
    absolutePath,
    (changedFile) => {
      log.warn(`File changed: ${changedFile}`);
      compile(absolutePath, options, programArgs);
    },
    (directory, error) =>
      log.error(
        `Error watching ${directory}: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
  const sourceCount = watcher.refresh();
  log.info(`Found ${sourceCount} source files to watch\n`);

  // Keep the process alive
  log.info("Watching for changes...\n");
  return watcher;
}

/**
 * Compile with error recovery
 */
function compile(
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  // Clear screen if --clear flag is set
  if (options.clear) {
    console.clear();
  }

  const timestamp = new Date().toLocaleTimeString();
  log.info(`[${timestamp}] Compiling ${filePath}...`);

  const startTime = Date.now();

  try {
    // Keep watch flag true so error handling doesn't exit the process
    processFile(filePath, options, programArgs);

    const elapsed = Date.now() - startTime;

    if (options.time) {
      log.info(`[${timestamp}] ✓ Compilation successful (${elapsed}ms)\n`);
    } else {
      log.info(`[${timestamp}] ✓ Compilation successful\n`);
    }
  } catch (_e) {
    const elapsed = Date.now() - startTime;

    // Error is already printed by processFile
    if (options.time) {
      log.error(`[${timestamp}] ✗ Compilation failed (${elapsed}ms)\n`);
    } else {
      log.error(`[${timestamp}] ✗ Compilation failed\n`);
    }
    // Don't exit - continue watching
  }
}

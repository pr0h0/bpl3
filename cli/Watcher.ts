/**
 * File Watcher for Watch Mode
 * Monitors BPL source files and triggers recompilation on changes
 */

import * as fs from "fs";
import * as path from "path";
import { processFile, getCompiledExecutablePath } from "./CompilationRunner";
import { WatchProgramRunner } from "./WatchProgramRunner";
import type { CompileOptions } from "./types";
import { Logger } from "../compiler/common/Logger";
import { createSourceWatcher, type SourceWatcher } from "./SourceWatcher";

const log = new Logger("Watch");

export interface WatchSession extends SourceWatcher {
  close(): Promise<void>;
}

/**
 * Start watching files and recompile on changes
 */
export function watchMode(
  entryFile: string,
  options: CompileOptions,
  programArgs?: string[],
): WatchSession {
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

  const runner = new WatchProgramRunner(
    (message) => log.error(message),
    (message) => log.warn(message),
  );
  let closed = false;
  let pending = false;
  let rebuilding: Promise<void> | undefined;
  const requestCompile = (): Promise<void> => {
    pending = true;
    if (rebuilding) return rebuilding;
    rebuilding = (async () => {
      while (pending && !closed) {
        pending = false;
        await runner.stop();
        if (closed) break;
        compile(absolutePath, options, runner, programArgs);
      }
    })().finally(() => {
      rebuilding = undefined;
    });
    return rebuilding;
  };

  const watcher = createSourceWatcher(
    absolutePath,
    (changedFile) => {
      log.warn(`File changed: ${changedFile}`);
      void requestCompile();
    },
    (directory, error) =>
      log.error(
        `Error watching ${directory}: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
  const sourceCount = watcher.refresh();
  log.info(`Found ${sourceCount} source files to watch\n`);

  let shutdown: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (shutdown) return shutdown;
    closed = true;
    pending = false;
    watcher.close();
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
    shutdown = (async () => {
      await runner.stop();
      await rebuilding;
    })();
    return shutdown;
  };
  const onInterrupt = () => {
    void close().then(() => process.exit(130));
  };
  const onTerminate = () => {
    void close().then(() => process.exit(143));
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);

  void requestCompile().finally(() => {
    if (!closed) log.info("Watching for changes...\n");
  });
  return { refresh: () => watcher.refresh(), close };
}

/**
 * Compile with error recovery
 */
function compile(
  filePath: string,
  options: CompileOptions,
  runner: WatchProgramRunner,
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
    processFile(filePath, { ...options, watch: true, run: false }, programArgs);
    const executable = getCompiledExecutablePath(filePath, options);
    if (options.run && options.noRun !== true && executable) {
      if (options.verbose) log.info(`Running executable: ${executable}`);
      runner.start(executable, programArgs ?? []);
    }

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

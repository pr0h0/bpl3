/**
 * File Watcher for Watch Mode
 * Monitors BPL source files and triggers recompilation on changes
 */

import * as fs from "fs";
import * as path from "path";
import { processFile } from "./CompilationRunner";
import type { CompileOptions } from "./types";
import { Logger } from "../compiler/common/Logger";

const log = new Logger("Watch");

/**
 * Debounce utility to prevent excessive recompilation
 */
function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: Timer | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Watch a directory recursively and collect all .bpl files
 */
function collectBPLFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, .git, bpl_modules, and other common ignore patterns
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "bpl_modules" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...collectBPLFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".bpl")) {
        files.push(fullPath);
      }
    }
  } catch (_e) {
    // Ignore errors (e.g., permission denied)
  }

  return files;
}

/**
 * Start watching files and recompile on changes
 */
export function watchMode(
  entryFile: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
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

  // Track watched files to avoid duplicate watchers
  const watchedPaths = new Set<string>();

  // Collect all .bpl files in the directory tree
  const bplFiles = collectBPLFiles(watchDir);
  log.info(`Found ${bplFiles.length} BPL files to watch\n`);

  // Debounced compilation function
  const debouncedCompile = debounce(
    (changedFile: string) => {
      log.warn(`File changed: ${changedFile}`);
      compile(absolutePath, options, programArgs);
    },
    100, // 100ms debounce
  );

  // Watch each .bpl file
  for (const file of bplFiles) {
    if (watchedPaths.has(file)) continue;
    watchedPaths.add(file);

    try {
      const watcher = fs.watch(file, (eventType, _filename) => {
        if (eventType === "change") {
          debouncedCompile(file);
        }
      });

      // Handle watcher errors
      watcher.on("error", (err) => {
        log.error(`Error watching ${file}`, err);
      });
    } catch (_e) {
      log.error(`Failed to watch ${file}`);
    }
  }

  // Keep the process alive
  log.info("Watching for changes...\n");
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

import * as fs from "node:fs";
import * as path from "node:path";
import { Parser } from "../compiler/frontend/Parser";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";

const IGNORED_DIRECTORIES = new Set(["node_modules", "bpl_modules"]);
export function isIgnoredWatchDirectory(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name);
}

export interface SourceWatchTargets {
  directories: Set<string>;
  sources: Set<string>;
}

/** Resolve existing dependencies and keep the nearest directory of missing relative imports observable. */
export function collectSourceWatchTargets(
  entryFile: string,
): SourceWatchTargets {
  const directories = new Set<string>();
  const sources = new Set<string>();
  const root = path.dirname(path.resolve(entryFile));
  const pendingDirectories = [root];
  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop()!;
    if (directories.has(directory)) continue;
    directories.add(directory);
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() && !isIgnoredWatchDirectory(entry.name))
          pendingDirectories.push(file);
        else if (entry.isFile() && /\.(bpl|x)$/.test(entry.name))
          sources.add(file);
      }
    } catch {
      // A directory may disappear during an editor save; its parent remains watched.
    }
  }
  const resolver = new ModuleResolver();
  const pendingFiles = [path.resolve(entryFile)];
  const visited = new Set<string>();
  while (pendingFiles.length) {
    const file = pendingFiles.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    sources.add(file);
    directories.add(path.dirname(file));
    try {
      const program = new Parser(fs.readFileSync(file, "utf8"), file).parse();
      for (const statement of program.statements) {
        if (statement.kind !== "Import") continue;
        const imported = statement.source;
        if (
          imported.startsWith("./") ||
          imported.startsWith("../") ||
          path.isAbsolute(imported)
        ) {
          const candidate = path.resolve(path.dirname(file), imported);
          try {
            if (fs.statSync(candidate).isDirectory())
              directories.add(candidate);
          } catch {
            // A missing directory import is covered by its nearest existing parent.
          }
          let directory = path.dirname(candidate);
          while (
            !fs.existsSync(directory) &&
            path.dirname(directory) !== directory
          )
            directory = path.dirname(directory);
          directories.add(directory);
        }
        try {
          pendingFiles.push(resolver.resolveModulePath(imported, file));
        } catch {
          // Compilation owns diagnostics. The watched directory permits recovery after creation.
        }
      }
    } catch {
      // Invalid/incomplete editor buffers are still watched and compiled normally.
    }
  }
  return { directories, sources };
}

import * as fs from "node:fs";
import * as path from "node:path";
import { Parser } from "../compiler/frontend/Parser";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";

const IGNORED_DIRECTORIES = new Set(["node_modules", "bpl_modules"]);
export function isIgnoredWatchDirectory(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name);
}

/** Match the module resolver's identity while retaining missing source paths. */
function canonicalWatchPath(file: string): string {
  const absolute = path.resolve(file);
  try {
    return fs.realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/** Observe recovery without recursively scanning an unrelated ancestor tree. */
function nearestExistingDirectory(directory: string): string {
  let current = directory;
  while (true) {
    try {
      if (fs.statSync(current).isDirectory())
        return canonicalWatchPath(current);
    } catch {
      /* Try the parent of a missing or inaccessible directory. */
    }
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
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
  const linkParents = new Set<string>();
  const observeLinkParents = (file: string) => {
    let current = path.resolve(file);
    while (true) {
      const parent = path.dirname(current);
      if (parent === current) break;
      try {
        if (fs.lstatSync(current).isSymbolicLink())
          linkParents.add(nearestExistingDirectory(parent));
      } catch {
        // Missing components remain observable through their existing ancestors.
      }
      current = parent;
    }
  };
  observeLinkParents(entryFile);
  const canonicalEntry = canonicalWatchPath(entryFile);
  const root = canonicalWatchPath(path.dirname(path.resolve(entryFile)));
  const pendingDirectories = [root];
  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop()!;
    if (directories.has(directory)) continue;
    try {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      directories.add(directory);
      for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() && !isIgnoredWatchDirectory(entry.name))
          pendingDirectories.push(file);
        else if (entry.isFile() && /\.(bpl|x)$/.test(entry.name))
          sources.add(file);
      }
    } catch {
      // Watch only the nearest parent while the source directory is absent.
      directories.add(nearestExistingDirectory(path.dirname(directory)));
    }
  }
  const resolver = new ModuleResolver();
  const pendingFiles = [canonicalEntry];
  const visited = new Set<string>();
  while (pendingFiles.length) {
    const file = canonicalWatchPath(pendingFiles.pop()!);
    if (visited.has(file)) continue;
    visited.add(file);
    sources.add(file);
    directories.add(nearestExistingDirectory(path.dirname(file)));
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
          observeLinkParents(candidate);
          try {
            if (fs.statSync(candidate).isDirectory())
              directories.add(canonicalWatchPath(candidate));
          } catch {
            // A missing directory import is covered by its nearest existing parent.
          }
          directories.add(nearestExistingDirectory(path.dirname(candidate)));
        }
        try {
          pendingFiles.push(
            resolver.resolveModulePath(imported, file, (candidate) => {
              observeLinkParents(candidate);
              directories.add(nearestExistingDirectory(candidate));
            }),
          );
        } catch {
          // Compilation owns diagnostics. The watched directory permits recovery after creation.
        }
      }
    } catch {
      // Invalid/incomplete editor buffers are still watched and compiled normally.
    }
  }
  // Observe link replacement without scanning unrelated ancestor trees.
  for (const parent of linkParents) directories.add(parent);
  return { directories, sources };
}

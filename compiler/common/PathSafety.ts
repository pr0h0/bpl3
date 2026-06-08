import * as fs from "fs";
import * as path from "path";

export interface TrustedSymlinkRoot {
  path: string;
  realPath: string;
}

export interface SymlinkPathOptions {
  trustedSymlinks?: readonly TrustedSymlinkRoot[];
}

export interface CaseMismatchPathOptions {
  directoryEntries?: Map<string, string[] | null>;
}

export function findSymlinkedParentPath(
  filePath: string,
  options: SymlinkPathOptions = {},
): string | null {
  return findSymlinkedPathComponent(
    path.dirname(path.resolve(filePath)),
    options,
  );
}

export function findSymlinkedPathComponent(
  targetPath: string,
  options: SymlinkPathOptions = {},
): string | null {
  const absolutePath = path.resolve(targetPath);
  for (const currentPath of pathComponents(absolutePath).slice(1)) {
    const stats = tryLstat(currentPath);
    if (stats?.isSymbolicLink()) {
      if (isTrustedSymlinkRoot(currentPath, options)) {
        continue;
      }
      return currentPath;
    }
    if (stats && !stats.isDirectory()) return null;
  }

  return null;
}

export function findNonDirectoryPathComponent(targetPath: string): string | null {
  const absolutePath = path.resolve(targetPath);

  for (const currentPath of pathComponents(absolutePath).slice(1)) {
    const stats = tryLstat(currentPath);
    if (!stats) {
      return null;
    }
    if (stats.isSymbolicLink()) {
      return null;
    }
    if (!stats.isDirectory()) {
      return currentPath;
    }
  }

  return null;
}

export function findCaseMismatchPath(
  targetPath: string,
  options: CaseMismatchPathOptions = {},
): string | null {
  const absolutePath = path.resolve(targetPath);
  const rootPath = path.parse(absolutePath).root;
  const components = path
    .relative(rootPath, absolutePath)
    .split(/[\\/]+/)
    .filter(Boolean);
  let currentPath = rootPath;

  for (const component of components) {
    const entries = readDirectoryEntries(
      currentPath,
      options.directoryEntries,
    );
    if (!entries) return null;

    if (entries.includes(component)) {
      currentPath = path.join(currentPath, component);
      continue;
    }

    const actualEntry = entries.find(
      (entry) => entry.toLowerCase() === component.toLowerCase(),
    );
    if (actualEntry) {
      return path.join(currentPath, actualEntry);
    }

    return null;
  }

  return null;
}

function readDirectoryEntries(
  directoryPath: string,
  cache: Map<string, string[] | null> | undefined,
): string[] | null {
  if (cache?.has(directoryPath)) {
    return cache.get(directoryPath)!;
  }

  const entries = tryReadDirectory(directoryPath);
  cache?.set(directoryPath, entries);
  return entries;
}

function pathComponents(absolutePath: string): string[] {
  const rootPath = path.parse(absolutePath).root;
  const components = path
    .relative(rootPath, absolutePath)
    .split(/[\\/]+/)
    .filter(Boolean);
  const paths = [rootPath];
  let currentPath = rootPath;

  for (const component of components) {
    currentPath = path.join(currentPath, component);
    paths.push(currentPath);
  }

  return paths;
}

function isTrustedSymlinkRoot(
  symlinkPath: string,
  options: SymlinkPathOptions,
): boolean {
  const trustedSymlinks =
    options.trustedSymlinks ?? getTrustedPlatformSymlinkRoots();
  const absoluteSymlinkPath = path.resolve(symlinkPath);

  for (const trusted of trustedSymlinks) {
    if (path.resolve(trusted.path) !== absoluteSymlinkPath) {
      continue;
    }

    try {
      return (
        path.resolve(fs.realpathSync(symlinkPath)) ===
        path.resolve(trusted.realPath)
      );
    } catch {
      return false;
    }
  }

  return false;
}

function getTrustedPlatformSymlinkRoots(): readonly TrustedSymlinkRoot[] {
  if (process.platform !== "darwin") {
    return [];
  }

  return [
    { path: "/var", realPath: "/private/var" },
    { path: "/tmp", realPath: "/private/tmp" },
  ];
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}

function tryReadDirectory(directoryPath: string): string[] | null {
  try {
    return fs.readdirSync(directoryPath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}

import * as fs from "fs";
import * as path from "path";

export interface TrustedSymlinkRoot {
  path: string;
  realPath: string;
}

export interface SymlinkPathOptions {
  trustedSymlinks?: readonly TrustedSymlinkRoot[];
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
  const rootPath = path.parse(absolutePath).root;
  const parts = path
    .relative(rootPath, absolutePath)
    .split(path.sep)
    .filter((part) => part.length > 0);

  let currentPath = rootPath;
  for (const part of parts) {
    currentPath = path.join(currentPath, part);
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

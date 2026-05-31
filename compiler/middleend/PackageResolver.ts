import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type PackageResolutionSource = "local" | "workspace" | "global";

export type PackageResolutionFailureReason =
  | "invalid-import"
  | "package-not-found"
  | "manifest-invalid"
  | "entrypoint-not-found"
  | "subpath-not-found";

export interface PackageResolutionResult {
  filePath: string;
  packageName: string;
  packageRoot: string;
  source: PackageResolutionSource;
}

export interface PackageResolutionTrace {
  importPath: string;
  startDir: string;
  searchRoots: string[];
  searchedPaths: string[];
  entryCandidates: string[];
  packageName?: string;
  subPath?: string;
  nearestPackageRoot?: string;
  foundPackageRoot?: string;
  failureReason?: PackageResolutionFailureReason;
  failureMessage?: string;
}

export interface PackageResolutionDetails {
  result: PackageResolutionResult | null;
  trace: PackageResolutionTrace;
}

export interface PackageResolutionOptions {
  globalPackageDir?: string;
}

const PACKAGE_NAME_PATTERN = /^[a-z0-9-]+$/;
const PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

export function resolvePackageImport(
  importPath: string,
  startDir: string,
  options: PackageResolutionOptions = {},
): PackageResolutionDetails {
  const normalizedStartDir = path.resolve(startDir || process.cwd());
  const searchRoots = getPackageSearchRoots(normalizedStartDir);
  const trace: PackageResolutionTrace = {
    importPath,
    startDir: normalizedStartDir,
    searchRoots,
    searchedPaths: [],
    entryCandidates: [],
    nearestPackageRoot: findNearestPackageRoot(normalizedStartDir),
  };

  const parts = importPath.split(/[\\/]/);
  if (
    parts.length === 0 ||
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    trace.failureReason = "invalid-import";
    trace.failureMessage =
      "Package imports cannot contain empty, '.' or '..' path segments.";
    return { result: null, trace };
  }

  const packageName = parts[0]!;
  trace.packageName = packageName;
  trace.subPath = parts.slice(1).join("/");

  if (!isValidPackageName(packageName)) {
    trace.failureReason = "invalid-import";
    trace.failureMessage =
      "Package import names must use lowercase letters, digits, and hyphens only.";
    return { result: null, trace };
  }

  for (const searchRoot of searchRoots) {
    const result = resolvePackageFromBaseDir(
      path.join(searchRoot, "bpl_modules"),
      parts,
      "local",
      trace,
    );
    if (result) return { result, trace };
    if (hasTerminalPackageFailure(trace)) return { result: null, trace };
  }

  for (const searchRoot of searchRoots) {
    const result = resolvePackageFromBaseDir(
      path.join(searchRoot, "packages"),
      parts,
      "workspace",
      trace,
    );
    if (result) return { result, trace };
    if (hasTerminalPackageFailure(trace)) return { result: null, trace };
  }

  const globalPackageDir =
    options.globalPackageDir || path.join(os.homedir(), ".bpl", "packages");
  const result = resolvePackageFromBaseDir(
    globalPackageDir,
    parts,
    "global",
    trace,
    true,
  );
  if (result) return { result, trace };
  if (hasTerminalPackageFailure(trace)) return { result: null, trace };

  if (!trace.failureReason) {
    trace.failureReason = "package-not-found";
    trace.failureMessage = `Package '${trace.packageName}' was not found.`;
  }

  return { result: null, trace };
}

function hasTerminalPackageFailure(trace: PackageResolutionTrace): boolean {
  return Boolean(
    trace.failureReason && trace.failureReason !== "package-not-found",
  );
}

export function formatPackageResolutionHint(
  traces: PackageResolutionTrace[],
  extraSearchPaths: string[] = [],
): string {
  const primary = traces.find((trace) => trace.failureMessage) || traces[0];
  const lines: string[] = [];

  if (primary?.failureMessage) {
    lines.push(primary.failureMessage);
  } else {
    lines.push("Check if the module is installed or the import path is correct.");
  }

  const nearestPackageRoot = traces.find(
    (trace) => trace.nearestPackageRoot,
  )?.nearestPackageRoot;
  if (nearestPackageRoot) {
    lines.push(`Nearest package root: ${nearestPackageRoot}`);
  }

  const searchedPaths = uniquePaths([
    ...traces.flatMap((trace) => trace.entryCandidates),
    ...traces.flatMap((trace) => trace.searchedPaths),
    ...extraSearchPaths,
  ]);

  if (searchedPaths.length > 0) {
    lines.push("Searched paths:");
    for (const searchedPath of searchedPaths.slice(0, 20)) {
      lines.push(`  - ${searchedPath}`);
    }
    if (searchedPaths.length > 20) {
      lines.push(`  - ... ${searchedPaths.length - 20} more`);
    }
  }

  return lines.join("\n");
}

export function getPackageSearchRoots(startDir: string): string[] {
  const roots: string[] = [];
  let current = path.resolve(startDir || process.cwd());

  while (true) {
    roots.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return roots;
}

function resolvePackageFromBaseDir(
  baseDir: string,
  parts: string[],
  source: PackageResolutionSource,
  trace: PackageResolutionTrace,
  includeVersionedGlobalDirs = false,
): PackageResolutionResult | null {
  const packageName = parts[0]!;
  trace.searchedPaths.push(baseDir);

  for (const packageRoot of getPackageRootCandidates(
    baseDir,
    packageName,
    includeVersionedGlobalDirs,
  )) {
    trace.searchedPaths.push(packageRoot);

    const packageRootStats = tryLstat(packageRoot);
    if (!packageRootStats?.isDirectory()) continue;
    const manifestPath = path.join(packageRoot, "bpl.json");
    if (!tryLstat(manifestPath)) continue;

    trace.foundPackageRoot = packageRoot;

    const manifest = readPackageManifest(manifestPath);
    if (manifest === null) {
      trace.failureReason = "manifest-invalid";
      trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}.`;
      return null;
    }
    if (!validatePackageManifestMatchesImport(packageRoot, manifest, trace)) {
      return null;
    }

    const filePath =
      parts.length === 1
        ? resolvePackageEntryPoint(packageRoot, manifest, trace)
        : resolvePackageSourcePath(
            path.join(packageRoot, ...parts.slice(1)),
            trace,
          );

    if (filePath) {
      return {
        filePath,
        packageName,
        packageRoot,
        source,
      };
    }

    if (trace.failureReason) {
      return null;
    } else if (parts.length === 1) {
      trace.failureReason = "entrypoint-not-found";
      trace.failureMessage = `Package '${packageName}' exists at ${packageRoot}, but its entrypoint was not found.`;
    } else {
      trace.failureReason = "subpath-not-found";
      trace.failureMessage = `Package '${packageName}' exists at ${packageRoot}, but subpath '${parts.slice(1).join("/")}' was not found.`;
    }
  }

  return null;
}

function getPackageRootCandidates(
  baseDir: string,
  packageName: string,
  includeVersionedGlobalDirs: boolean,
): string[] {
  const candidates = [path.join(baseDir, packageName)];
  const baseStats = tryLstat(baseDir);
  if (!includeVersionedGlobalDirs || !baseStats?.isDirectory()) {
    return candidates;
  }

  const versioned = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .map((entry) => {
      if (!entry.isDirectory()) return null;
      const version = parseVersionedPackageDirectory(packageName, entry.name);
      if (!version) return null;
      return {
        path: path.join(baseDir, entry.name),
        version,
      };
    })
    .filter(
      (entry): entry is { path: string; version: [number, number, number] } =>
        entry !== null,
    )
    .sort((left, right) => compareSemverDesc(left.version, right.version))
    .map((entry) => entry.path);

  return [...candidates, ...versioned];
}

function parseVersionedPackageDirectory(
  packageName: string,
  directoryName: string,
): [number, number, number] | null {
  const prefix = `${packageName}-`;
  if (!directoryName.startsWith(prefix)) return null;

  const version = directoryName.slice(prefix.length);
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemverDesc(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let index = 0; index < 3; index++) {
    const delta = right[index]! - left[index]!;
    if (delta !== 0) return delta;
  }

  return 0;
}

function readPackageManifest(
  manifestPath: string,
): Record<string, unknown> | null {
  try {
    const manifestStats = tryLstat(manifestPath);
    if (!manifestStats?.isFile()) return null;

    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function validatePackageManifestMatchesImport(
  packageRoot: string,
  manifest: Record<string, unknown>,
  trace: PackageResolutionTrace,
): boolean {
  const manifestPath = path.join(packageRoot, "bpl.json");
  const packageName = trace.packageName!;

  if (
    typeof manifest.name !== "string" ||
    !isValidPackageName(manifest.name)
  ) {
    trace.failureReason = "manifest-invalid";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest name must use lowercase letters, digits, and hyphens only.`;
    return false;
  }

  if (manifest.name !== packageName) {
    trace.failureReason = "manifest-invalid";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest name '${String(
      manifest.name,
    )}' does not match requested package '${packageName}'.`;
    return false;
  }

  if (
    typeof manifest.version !== "string" ||
    !isValidPackageVersion(manifest.version)
  ) {
    trace.failureReason = "manifest-invalid";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest version must use X.Y.Z semantic version format.`;
    return false;
  }

  const versionedDirectory = parseVersionedPackageDirectory(
    packageName,
    path.basename(packageRoot),
  );
  if (versionedDirectory) {
    const expectedVersion = versionedDirectory.join(".");
    if (manifest.version !== expectedVersion) {
      trace.failureReason = "manifest-invalid";
      trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest version '${String(
        manifest.version,
      )}' does not match package directory version '${expectedVersion}'.`;
      return false;
    }
  }

  return true;
}

function isValidPackageName(name: string): boolean {
  return PACKAGE_NAME_PATTERN.test(name);
}

function isValidPackageVersion(version: string): boolean {
  return PACKAGE_VERSION_PATTERN.test(version);
}

function resolvePackageEntryPoint(
  packageRoot: string,
  manifest: Record<string, unknown>,
  trace: PackageResolutionTrace,
): string | null {
  const main = manifest.main;
  const entry = manifest.entry;
  let mainEntry = "index.bpl";
  if (typeof main === "string") {
    mainEntry = main;
  } else if (typeof entry === "string") {
    mainEntry = entry;
  }

  if (!isSafeManifestRelativePath(mainEntry)) {
    trace.failureReason = "manifest-invalid";
    trace.failureMessage = `Package '${trace.packageName}' has an unsafe entrypoint '${mainEntry}' in bpl.json.`;
    return null;
  }

  return resolvePackageSourcePath(
    path.join(packageRoot, ...mainEntry.split(/[\\/]/)),
    trace,
  );
}

function resolvePackageSourcePath(
  filePath: string,
  trace: PackageResolutionTrace,
): string | null {
  const directStats = tryLstat(filePath);
  if (directStats) {
    if (directStats.isSymbolicLink()) {
      trace.entryCandidates.push(filePath);
      failOnSymlinkedSourceCandidate(filePath, trace);
      return null;
    }
    if (directStats.isFile()) {
      trace.entryCandidates.push(filePath);
      return filePath;
    }
    if (directStats.isDirectory()) {
      for (const indexName of ["index.bpl", "index.x"]) {
        const indexPath = path.join(filePath, indexName);
        trace.entryCandidates.push(indexPath);
        if (tryLstat(indexPath)?.isFile()) {
          return indexPath;
        }
      }
    }
  }

  for (const ext of [".bpl", ".x", ""]) {
    const fullPath =
      filePath.endsWith(".bpl") || filePath.endsWith(".x")
        ? filePath
        : filePath + ext;
    trace.entryCandidates.push(fullPath);
    const stats = tryLstat(fullPath);
    if (stats?.isSymbolicLink()) {
      failOnSymlinkedSourceCandidate(fullPath, trace);
      return null;
    }
    if (stats?.isFile()) {
      return fullPath;
    }
  }

  return null;
}

function failOnSymlinkedSourceCandidate(
  filePath: string,
  trace: PackageResolutionTrace,
): void {
  if (trace.subPath) {
    trace.failureReason = "subpath-not-found";
    trace.failureMessage = `Package '${trace.packageName}' subpath '${trace.subPath}' resolves to a symbolic link candidate: ${filePath}.`;
    return;
  }

  trace.failureReason = "entrypoint-not-found";
  trace.failureMessage = `Package '${trace.packageName}' entrypoint resolves to a symbolic link candidate: ${filePath}.`;
}

function findNearestPackageRoot(startDir: string): string | undefined {
  for (const root of getPackageSearchRoots(startDir)) {
    if (tryLstat(path.join(root, "bpl.json"))?.isFile()) {
      return root;
    }
  }

  return undefined;
}

function isSafeManifestRelativePath(relativePath: string): boolean {
  if (relativePath.length === 0) return false;
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    return false;
  }

  const parts = relativePath.split(/[\\/]/);
  return parts.every(
    (part) => part.length > 0 && part !== "." && part !== "..",
  );
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

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter((searchedPath) => searchedPath.length > 0))];
}

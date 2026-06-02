import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { findCaseMismatchPath } from "../common/PathSafety";

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
  failureCode?: PackageResolutionFailureCode;
  failureMessage?: string;
}

export interface PackageResolutionDetails {
  result: PackageResolutionResult | null;
  trace: PackageResolutionTrace;
}

export interface PackageResolutionOptions {
  globalPackageDir?: string;
}

export const PACKAGE_RESOLUTION_FAILURE_CODES = [
  "BPL_PACKAGE_IMPORT_INVALID",
  "BPL_PACKAGE_NOT_FOUND",
  "BPL_PACKAGE_ENTRYPOINT_CASE_MISMATCH",
  "BPL_PACKAGE_ENTRYPOINT_SYMLINK",
  "BPL_PACKAGE_ENTRYPOINT_NOT_FOUND",
  "BPL_PACKAGE_SUBPATH_CASE_MISMATCH",
  "BPL_PACKAGE_SUBPATH_SYMLINK",
  "BPL_PACKAGE_SUBPATH_NOT_EXPORTED",
  "BPL_PACKAGE_SUBPATH_NOT_FOUND",
  "BPL_PACKAGE_SEARCH_DIR_CASE_MISMATCH",
  "BPL_PACKAGE_ROOT_CASE_MISMATCH",
  "BPL_PACKAGE_SEARCH_DIR_SYMLINK",
  "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
  "BPL_PACKAGE_ROOT_SYMLINK",
  "BPL_PACKAGE_ROOT_NOT_DIRECTORY",
  "BPL_PACKAGE_MANIFEST_MISSING",
  "BPL_PACKAGE_MANIFEST_SYMLINK",
  "BPL_PACKAGE_MANIFEST_CASE_MISMATCH",
  "BPL_PACKAGE_MANIFEST_NOT_FILE",
  "BPL_PACKAGE_MANIFEST_PARSE_ERROR",
  "BPL_PACKAGE_MANIFEST_NOT_OBJECT",
  "BPL_PACKAGE_ENTRYPOINT_UNSAFE",
  "BPL_PACKAGE_MANIFEST_INVALID",
] as const;

export type PackageResolutionFailureCode =
  (typeof PACKAGE_RESOLUTION_FAILURE_CODES)[number];

const PACKAGE_NAME_PATTERN = /^[a-z0-9-]+$/;
const PACKAGE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const PACKAGE_VERSION_CAPTURE_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const PACKAGE_VERSION_RANGE_PATTERN =
  /^[~^](?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const PACKAGE_VERSION_COMPARATOR_PATTERN =
  /^(>=|>|<=|<|=)(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const PACKAGE_VERSION_COMPARATOR_LIST_PATTERN =
  /^(>=|>|<=|<|=)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(\s+(>=|>|<=|<|=)?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))+$/;

type SemanticVersion = [bigint, bigint, bigint];

interface PackageRootCandidate {
  rootPath: string;
}

interface VersionedPackageRootCandidate extends PackageRootCandidate {
  version: SemanticVersion;
}

type PackageRootCandidateClassification =
  | { status: "missing"; rootPath: string }
  | { status: "case-mismatch"; rootPath: string; actualPath: string }
  | { status: "symlink"; rootPath: string }
  | { status: "non-directory"; rootPath: string }
  | { status: "directory"; rootPath: string };

type PackageManifestReadResult =
  | { ok: true; manifest: Record<string, unknown> }
  | { ok: false; message: string };

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
    trace.failureCode = "BPL_PACKAGE_IMPORT_INVALID";
    trace.failureMessage =
      "Package imports cannot contain empty, '.' or '..' path segments.";
    return { result: null, trace };
  }

  const packageName = parts[0]!;
  trace.packageName = packageName;
  trace.subPath = parts.slice(1).join("/");

  if (!isValidPackageName(packageName)) {
    trace.failureReason = "invalid-import";
    trace.failureCode = "BPL_PACKAGE_IMPORT_INVALID";
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
    trace.failureCode = "BPL_PACKAGE_NOT_FOUND";
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
    if (isGlobalPackageDirectorySymlinkFailure(primary.failureMessage)) {
      lines.push(
        "Move the symlink out of the way or choose a real package root directory.",
      );
      return lines.join("\n");
    }
    lines.push(primary.failureMessage);
    if (primary.failureMessage.includes("casing does not match filesystem")) {
      lines.push("Use the exact filesystem casing shown in the diagnostic.");
    }
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

export function getPackageResolutionFailureCode(
  trace: PackageResolutionTrace,
): string | undefined {
  if (trace.failureCode) return trace.failureCode;
  if (!trace.failureReason) return undefined;

  const message = trace.failureMessage ?? "";
  switch (trace.failureReason) {
    case "invalid-import":
      return "BPL_PACKAGE_IMPORT_INVALID";
    case "package-not-found":
      return "BPL_PACKAGE_NOT_FOUND";
    case "entrypoint-not-found":
      if (message.includes("entrypoint casing does not match")) {
        return "BPL_PACKAGE_ENTRYPOINT_CASE_MISMATCH";
      }
      return message.includes("symbolic link candidate")
        ? "BPL_PACKAGE_ENTRYPOINT_SYMLINK"
        : "BPL_PACKAGE_ENTRYPOINT_NOT_FOUND";
    case "subpath-not-found":
      if (message.includes("casing does not match")) {
        return "BPL_PACKAGE_SUBPATH_CASE_MISMATCH";
      }
      if (message.includes("is not exported")) {
        return "BPL_PACKAGE_SUBPATH_NOT_EXPORTED";
      }
      return message.includes("symbolic link candidate")
        ? "BPL_PACKAGE_SUBPATH_SYMLINK"
        : "BPL_PACKAGE_SUBPATH_NOT_FOUND";
    case "manifest-invalid":
      if (message.includes("package search directory casing does not match")) {
        return "BPL_PACKAGE_SEARCH_DIR_CASE_MISMATCH";
      }
      if (message.includes("package root casing does not match")) {
        return "BPL_PACKAGE_ROOT_CASE_MISMATCH";
      }
      if (
        message.includes("package search directory is a symbolic link") ||
        isGlobalPackageDirectorySymlinkFailure(message)
      ) {
        return "BPL_PACKAGE_SEARCH_DIR_SYMLINK";
      }
      if (
        message.includes("package search directory is not a directory") ||
        isGlobalPackageDirectoryNotDirectoryFailure(message)
      ) {
        return "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY";
      }
      if (message.includes("package root is a symbolic link")) {
        return "BPL_PACKAGE_ROOT_SYMLINK";
      }
      if (message.includes("package root is not a directory")) {
        return "BPL_PACKAGE_ROOT_NOT_DIRECTORY";
      }
      if (message.includes("missing bpl.json")) {
        return "BPL_PACKAGE_MANIFEST_MISSING";
      }
      if (message.includes("manifest path is a symbolic link")) {
        return "BPL_PACKAGE_MANIFEST_SYMLINK";
      }
      if (message.includes("manifest path casing does not match")) {
        return "BPL_PACKAGE_MANIFEST_CASE_MISMATCH";
      }
      if (message.includes("manifest path is not a file")) {
        return "BPL_PACKAGE_MANIFEST_NOT_FILE";
      }
      if (message.includes("manifest is not valid JSON")) {
        return "BPL_PACKAGE_MANIFEST_PARSE_ERROR";
      }
      if (message.includes("manifest must contain a JSON object")) {
        return "BPL_PACKAGE_MANIFEST_NOT_OBJECT";
      }
      if (message.includes("unsafe entrypoint")) {
        return "BPL_PACKAGE_ENTRYPOINT_UNSAFE";
      }
      return "BPL_PACKAGE_MANIFEST_INVALID";
  }
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

  const baseDirCaseMismatch = findCaseMismatchPath(baseDir);
  if (baseDirCaseMismatch) {
    failOnCaseMismatchedPackageSearchDirectory(
      baseDir,
      baseDirCaseMismatch,
      trace,
    );
    return null;
  }

  const baseStats = tryLstat(baseDir);
  if (baseStats?.isSymbolicLink()) {
    failOnSymlinkedPackageSearchDirectory(
      baseDir,
      trace,
      source === "global" ? "Global package directory" : undefined,
    );
    return null;
  }
  if (baseStats && !baseStats.isDirectory()) {
    failOnNonDirectoryPackageSearchDirectory(
      baseDir,
      trace,
      source === "global" ? "Global package directory" : undefined,
    );
    return null;
  }

  for (const packageRoot of getPackageRootCandidates(
    baseDir,
    packageName,
    includeVersionedGlobalDirs,
    Boolean(baseStats?.isDirectory()),
  )) {
    trace.searchedPaths.push(packageRoot.rootPath);

    const classification = classifyPackageRootCandidate(packageRoot);
    if (classification.status === "missing") continue;
    if (classification.status === "case-mismatch") {
      trace.foundPackageRoot = classification.actualPath;
      failOnCaseMismatchedPackageRoot(
        classification.rootPath,
        classification.actualPath,
        trace,
      );
      return null;
    }
    if (classification.status === "symlink") {
      trace.foundPackageRoot = classification.rootPath;
      failOnSymlinkedPackageRoot(classification.rootPath, trace);
      return null;
    }
    if (classification.status === "non-directory") {
      trace.foundPackageRoot = classification.rootPath;
      failOnInvalidPackageRoot(
        classification.rootPath,
        "package root is not a directory",
        trace,
      );
      return null;
    }
    const packageRootPath = classification.rootPath;
    const manifestPath = path.join(packageRootPath, "bpl.json");
    const manifestCaseMismatchPath = findCaseMismatchPath(manifestPath);
    if (manifestCaseMismatchPath) {
      trace.foundPackageRoot = packageRootPath;
      failOnCaseMismatchedPackageManifest(
        manifestPath,
        manifestCaseMismatchPath,
        trace,
      );
      return null;
    }
    if (!tryLstat(manifestPath)) {
      trace.foundPackageRoot = packageRootPath;
      failOnMissingPackageManifest(manifestPath, trace);
      return null;
    }

    trace.foundPackageRoot = packageRootPath;

    const manifestRead = readPackageManifest(manifestPath);
    if (!manifestRead.ok) {
      trace.failureReason = "manifest-invalid";
      trace.failureCode = getPackageManifestReadFailureCode(
        manifestRead.message,
      );
      trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: ${manifestRead.message}.`;
      return null;
    }
    const manifest = manifestRead.manifest;
    if (!validatePackageManifestMatchesImport(packageRootPath, manifest, trace)) {
      return null;
    }

    const filePath =
      parts.length === 1
        ? resolvePackageEntryPoint(packageRootPath, manifest, trace)
        : resolvePackageSubpath(packageRootPath, manifest, parts, trace);

    if (filePath) {
      return {
        filePath,
        packageName,
        packageRoot: packageRootPath,
        source,
      };
    }

    if (trace.failureReason) {
      return null;
    } else if (parts.length === 1) {
      trace.failureReason = "entrypoint-not-found";
      trace.failureCode = "BPL_PACKAGE_ENTRYPOINT_NOT_FOUND";
      trace.failureMessage = `Package '${packageName}' exists at ${packageRootPath}, but its entrypoint was not found.`;
    } else {
      trace.failureReason = "subpath-not-found";
      trace.failureCode = "BPL_PACKAGE_SUBPATH_NOT_FOUND";
      trace.failureMessage = `Package '${packageName}' exists at ${packageRootPath}, but subpath '${parts.slice(1).join("/")}' was not found.`;
    }
  }

  return null;
}

function getPackageRootCandidates(
  baseDir: string,
  packageName: string,
  includeVersionedGlobalDirs: boolean,
  baseDirIsDirectory: boolean,
): PackageRootCandidate[] {
  const candidates = [exactPackageRootCandidate(baseDir, packageName)];
  if (!includeVersionedGlobalDirs || !baseDirIsDirectory) {
    return candidates;
  }

  return [
    ...candidates,
    ...getVersionedPackageRootCandidates(baseDir, packageName),
  ];
}

function exactPackageRootCandidate(
  baseDir: string,
  packageName: string,
): PackageRootCandidate {
  return { rootPath: path.join(baseDir, packageName) };
}

function getVersionedPackageRootCandidates(
  baseDir: string,
  packageName: string,
): VersionedPackageRootCandidate[] {
  return fs
    .readdirSync(baseDir)
    .map((entry) => {
      const candidate = parseVersionedPackageDirectoryCandidate(
        packageName,
        entry,
      );
      if (!candidate) return null;

      const { directoryName, version } = candidate;
      return {
        rootPath: path.join(baseDir, directoryName),
        version,
      };
    })
    .filter((entry): entry is VersionedPackageRootCandidate => entry !== null)
    .sort((left, right) => compareSemverDesc(left.version, right.version));
}

function parseVersionedPackageDirectoryCandidate(
  packageName: string,
  directoryName: string,
): { directoryName: string; version: SemanticVersion } | null {
  const prefix = `${packageName}-`;
  const exactVersion = parseVersionedPackageDirectory(packageName, directoryName);
  if (exactVersion) {
    return { directoryName, version: exactVersion };
  }

  if (!directoryName.toLowerCase().startsWith(prefix)) {
    return null;
  }

  const versionText = directoryName.slice(prefix.length);
  const version = parseSemanticVersion(versionText);
  if (!version) return null;

  return {
    directoryName: `${packageName}-${versionText}`,
    version,
  };
}

function parseVersionedPackageDirectory(
  packageName: string,
  directoryName: string,
): SemanticVersion | null {
  const prefix = `${packageName}-`;
  if (!directoryName.startsWith(prefix)) return null;

  return parseSemanticVersion(directoryName.slice(prefix.length));
}

function parseSemanticVersion(version: string): SemanticVersion | null {
  const match = PACKAGE_VERSION_CAPTURE_PATTERN.exec(version);
  if (!match) return null;

  return [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)];
}

function classifyPackageRootCandidate(
  candidate: PackageRootCandidate,
): PackageRootCandidateClassification {
  const caseMismatchPath = findCaseMismatchPath(candidate.rootPath);
  if (caseMismatchPath) {
    return {
      status: "case-mismatch",
      rootPath: candidate.rootPath,
      actualPath: caseMismatchPath,
    };
  }

  const packageRootStats = tryLstat(candidate.rootPath);
  if (!packageRootStats) {
    return { status: "missing", rootPath: candidate.rootPath };
  }
  if (packageRootStats.isSymbolicLink()) {
    return { status: "symlink", rootPath: candidate.rootPath };
  }
  if (!packageRootStats.isDirectory()) {
    return { status: "non-directory", rootPath: candidate.rootPath };
  }

  return { status: "directory", rootPath: candidate.rootPath };
}

function compareSemverDesc(
  left: SemanticVersion,
  right: SemanticVersion,
): number {
  for (let index = 0; index < 3; index++) {
    if (left[index] === right[index]) continue;
    return left[index]! > right[index]! ? -1 : 1;
  }

  return 0;
}

function readPackageManifest(
  manifestPath: string,
): PackageManifestReadResult {
  const caseMismatchPath = findCaseMismatchPath(manifestPath);
  if (caseMismatchPath) {
    return {
      ok: false,
      message: `manifest path casing does not match filesystem path ${caseMismatchPath}`,
    };
  }

  const manifestStats = tryLstat(manifestPath);
  if (!manifestStats) {
    return { ok: false, message: "missing bpl.json" };
  }
  if (manifestStats.isSymbolicLink()) {
    return { ok: false, message: "manifest path is a symbolic link" };
  }
  if (!manifestStats.isFile()) {
    return { ok: false, message: "manifest path is not a file" };
  }

  let source: string;
  try {
    source = fs.readFileSync(manifestPath, "utf-8");
  } catch {
    return { ok: false, message: "manifest could not be read" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { ok: false, message: "manifest is not valid JSON" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "manifest must contain a JSON object" };
  }

  return { ok: true, manifest: parsed as Record<string, unknown> };
}

function getPackageManifestReadFailureCode(
  message: string,
): PackageResolutionFailureCode {
  switch (message) {
    case "missing bpl.json":
      return "BPL_PACKAGE_MANIFEST_MISSING";
    case "manifest path is a symbolic link":
      return "BPL_PACKAGE_MANIFEST_SYMLINK";
    case "manifest path is not a file":
      return "BPL_PACKAGE_MANIFEST_NOT_FILE";
    case "manifest is not valid JSON":
      return "BPL_PACKAGE_MANIFEST_PARSE_ERROR";
    case "manifest must contain a JSON object":
      return "BPL_PACKAGE_MANIFEST_NOT_OBJECT";
    default:
      return message.includes("manifest path casing does not match")
        ? "BPL_PACKAGE_MANIFEST_CASE_MISMATCH"
        : "BPL_PACKAGE_MANIFEST_INVALID";
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
    trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest name must use lowercase letters, digits, and hyphens only.`;
    return false;
  }

  if (manifest.name !== packageName) {
    trace.failureReason = "manifest-invalid";
    trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
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
    trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
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
      trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
      trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest version '${String(
        manifest.version,
      )}' does not match package directory version '${expectedVersion}'.`;
      return false;
    }
  }

  for (const field of [
    "$schema",
    "description",
    "author",
    "license",
  ] as const) {
    if (manifest[field] !== undefined && typeof manifest[field] !== "string") {
      trace.failureReason = "manifest-invalid";
      trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
      trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest ${field} must be a string when present.`;
      return false;
    }
  }

  if (manifest.main !== undefined && typeof manifest.main !== "string") {
    trace.failureReason = "manifest-invalid";
    trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest main must be a string when present.`;
    return false;
  }

  if (manifest.entry !== undefined && typeof manifest.entry !== "string") {
    trace.failureReason = "manifest-invalid";
    trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest entry must be a string when present.`;
    return false;
  }

  for (const entrypoint of [manifest.main, manifest.entry]) {
    if (
      typeof entrypoint === "string" &&
      !isSafeManifestRelativePath(entrypoint)
    ) {
      return failOnUnsafePackageEntrypoint(packageRoot, entrypoint, trace);
    }
  }

  const exportsError = validatePackageManifestExports(manifest.exports);
  if (exportsError) {
    return failPackageManifestInvalid(
      packageName,
      manifestPath,
      trace,
      exportsError,
    );
  }

  if (
    manifest.keywords !== undefined &&
    (!Array.isArray(manifest.keywords) ||
      manifest.keywords.some((keyword) => typeof keyword !== "string"))
  ) {
    trace.failureReason = "manifest-invalid";
    trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest keywords must be an array of strings when present.`;
    return false;
  }

  const repository = manifest.repository;
  const repositoryRecord = repository as Record<string, unknown>;
  if (
    repository !== undefined &&
    (!repository ||
      typeof repository !== "object" ||
      Array.isArray(repository) ||
      repositoryRecord.type !== "git" ||
      typeof repositoryRecord.url !== "string")
  ) {
    trace.failureReason = "manifest-invalid";
    trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
    trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: manifest repository must contain type 'git' and a string url field when present.`;
    return false;
  }

  for (const field of ["dependencies", "devDependencies"] as const) {
    const error = validatePackageManifestDependencyMap(
      manifest[field],
      field,
    );
    if (error) {
      return failPackageManifestInvalid(packageName, manifestPath, trace, error);
    }
  }

  const scriptsError = validatePackageManifestScriptsMap(manifest.scripts);
  if (scriptsError) {
    return failPackageManifestInvalid(
      packageName,
      manifestPath,
      trace,
      scriptsError,
    );
  }

  const binError = validatePackageManifestBinMap(manifest.bin);
  if (binError) {
    return failPackageManifestInvalid(
      packageName,
      manifestPath,
      trace,
      binError,
    );
  }

  return true;
}

function failPackageManifestInvalid(
  packageName: string,
  manifestPath: string,
  trace: PackageResolutionTrace,
  detail: string,
): false {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_MANIFEST_INVALID";
  trace.failureMessage = `Package '${packageName}' has an invalid bpl.json at ${manifestPath}: ${detail}.`;
  return false;
}

function failOnUnsafePackageEntrypoint(
  packageRoot: string,
  entrypoint: string,
  trace: PackageResolutionTrace,
): false {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_ENTRYPOINT_UNSAFE";
  trace.failureMessage = `Package '${trace.packageName}' has an unsafe entrypoint '${entrypoint}' in bpl.json at ${path.join(
    packageRoot,
    "bpl.json",
  )} for package root ${packageRoot}.`;
  return false;
}

function validatePackageManifestExports(value: unknown): string | null {
  if (value === undefined) return null;
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) =>
        typeof entry !== "string" || !isSafeManifestRelativePath(entry),
    )
  ) {
    return "manifest exports must be an array of package-relative paths without empty, '.' or '..' segments when present";
  }

  return null;
}

function validatePackageManifestDependencyMap(
  value: unknown,
  field: "dependencies" | "devDependencies",
): string | null {
  if (value === undefined) return null;
  if (!isPlainJsonObject(value)) {
    return `manifest ${field} must be an object mapping package names to source strings when present`;
  }

  for (const [packageName, source] of Object.entries(value)) {
    if (!isValidPackageName(packageName)) {
      return `manifest ${field} package name '${packageName}' must use lowercase letters, digits, and hyphens only`;
    }

    if (typeof source !== "string" || source.trim().length === 0) {
      return `manifest ${field} source for ${packageName} must be a non-empty string`;
    }

    if (!isValidPackageDependencySource(source)) {
      return `manifest ${field} source '${source}' for ${packageName} must be a package name, exact version, version range, 'latest', '*', or package archive path`;
    }
  }

  return null;
}

function validatePackageManifestScriptsMap(value: unknown): string | null {
  if (value === undefined) return null;
  if (!isPlainJsonObject(value)) {
    return "manifest scripts must be an object mapping script names to commands when present";
  }

  for (const [scriptName, command] of Object.entries(value)) {
    if (
      scriptName.length === 0 ||
      typeof command !== "string" ||
      command.trim().length === 0
    ) {
      return "manifest scripts entries must map non-empty script names to command strings";
    }
  }

  return null;
}

function validatePackageManifestBinMap(value: unknown): string | null {
  if (value === undefined) return null;
  if (!isPlainJsonObject(value)) {
    return "manifest bin must be an object mapping command names to executable paths when present";
  }

  for (const [commandName, executablePath] of Object.entries(value)) {
    if (!isSafeBinCommandName(commandName)) {
      return `manifest bin command '${commandName}' must be a plain command name without path separators`;
    }

    if (
      typeof executablePath !== "string" ||
      !isSafeManifestRelativePath(executablePath)
    ) {
      return `manifest bin path for ${commandName} must be a package-relative path without empty, '.', or '..' segments`;
    }
  }

  return null;
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failOnSymlinkedPackageRoot(
  packageRoot: string,
  trace: PackageResolutionTrace,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_ROOT_SYMLINK";
  trace.failureMessage = `Package '${trace.packageName}' has an invalid package root at ${packageRoot}: package root is a symbolic link.`;
}

function failOnCaseMismatchedPackageRoot(
  requestedPackageRoot: string,
  actualPackageRoot: string,
  trace: PackageResolutionTrace,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_ROOT_CASE_MISMATCH";
  trace.failureMessage = `Package '${trace.packageName}' has an invalid package root at ${requestedPackageRoot}: package root casing does not match filesystem path ${actualPackageRoot}.`;
}

function failOnSymlinkedPackageSearchDirectory(
  searchDirectory: string,
  trace: PackageResolutionTrace,
  label?: string,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_SEARCH_DIR_SYMLINK";
  if (label) {
    trace.failureMessage = `${label} path is a symbolic link: ${searchDirectory}`;
    return;
  }
  trace.failureMessage = `Package '${trace.packageName}' has an invalid package search directory at ${searchDirectory}: package search directory is a symbolic link.`;
}

function isGlobalPackageDirectorySymlinkFailure(message: string): boolean {
  return message.includes("Global package directory path is a symbolic link");
}

function failOnNonDirectoryPackageSearchDirectory(
  searchDirectory: string,
  trace: PackageResolutionTrace,
  label?: string,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY";
  if (label) {
    trace.failureMessage = `${label} path is not a directory: ${searchDirectory}`;
    return;
  }
  trace.failureMessage = `Package '${trace.packageName}' has an invalid package search directory at ${searchDirectory}: package search directory is not a directory.`;
}

function isGlobalPackageDirectoryNotDirectoryFailure(message: string): boolean {
  return message.includes("Global package directory path is not a directory");
}

function failOnCaseMismatchedPackageSearchDirectory(
  requestedSearchDirectory: string,
  actualSearchDirectory: string,
  trace: PackageResolutionTrace,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_SEARCH_DIR_CASE_MISMATCH";
  trace.failureMessage = `Package '${trace.packageName}' has an invalid package search directory at ${requestedSearchDirectory}: package search directory casing does not match filesystem path ${actualSearchDirectory}.`;
}

function failOnInvalidPackageRoot(
  packageRoot: string,
  reason: string,
  trace: PackageResolutionTrace,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_ROOT_NOT_DIRECTORY";
  trace.failureMessage = `Package '${trace.packageName}' has an invalid package root at ${packageRoot}: ${reason}.`;
}

function failOnMissingPackageManifest(
  manifestPath: string,
  trace: PackageResolutionTrace,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_MANIFEST_MISSING";
  trace.failureMessage = `Package '${trace.packageName}' has an invalid bpl.json at ${manifestPath}: missing bpl.json.`;
}

function failOnCaseMismatchedPackageManifest(
  requestedManifestPath: string,
  actualManifestPath: string,
  trace: PackageResolutionTrace,
): void {
  trace.failureReason = "manifest-invalid";
  trace.failureCode = "BPL_PACKAGE_MANIFEST_CASE_MISMATCH";
  trace.failureMessage = `Package '${trace.packageName}' has an invalid bpl.json at ${requestedManifestPath}: manifest path casing does not match filesystem path ${actualManifestPath}.`;
}

function isValidPackageName(name: string): boolean {
  return PACKAGE_NAME_PATTERN.test(name);
}

function isValidPackageVersion(version: string): boolean {
  return PACKAGE_VERSION_PATTERN.test(version);
}

function isVersionSelectorSpec(value: string): boolean {
  if (value === "*" || value === "latest") return true;
  if (PACKAGE_VERSION_PATTERN.test(value)) return true;
  if (PACKAGE_VERSION_RANGE_PATTERN.test(value)) return true;
  if (PACKAGE_VERSION_COMPARATOR_PATTERN.test(value)) return true;
  return PACKAGE_VERSION_COMPARATOR_LIST_PATTERN.test(value);
}

function isPackageFileSource(fileSource: string): boolean {
  return (
    fileSource.endsWith(".tgz") ||
    fileSource.startsWith(".") ||
    path.isAbsolute(fileSource) ||
    path.win32.isAbsolute(fileSource) ||
    fileSource.includes("/") ||
    fileSource.includes("\\")
  );
}

function isValidPackageDependencySource(source: string): boolean {
  const fileSource = source.startsWith("file:") ? source.slice(5) : source;
  if (source.startsWith("file:")) {
    return isPackageFileSource(fileSource);
  }

  return (
    isPackageFileSource(fileSource) ||
    isVersionSelectorSpec(fileSource) ||
    isValidPackageName(fileSource)
  );
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
    failOnUnsafePackageEntrypoint(packageRoot, mainEntry, trace);
    return null;
  }

  return resolvePackageSourcePath(
    path.join(packageRoot, ...mainEntry.split(/[\\/]/)),
    packageRoot,
    trace,
  );
}

function resolvePackageSubpath(
  packageRoot: string,
  manifest: Record<string, unknown>,
  parts: string[],
  trace: PackageResolutionTrace,
): string | null {
  const exportAllowlist = getPackageSubpathExportAllowlist(
    packageRoot,
    manifest,
    trace,
  );
  if (exportAllowlist === false) {
    return null;
  }

  return resolvePackageSourcePath(
    path.join(packageRoot, ...parts.slice(1)),
    packageRoot,
    trace,
    exportAllowlist ?? undefined,
  );
}

function getPackageSubpathExportAllowlist(
  packageRoot: string,
  manifest: Record<string, unknown>,
  trace: PackageResolutionTrace,
): ReadonlySet<string> | null | false {
  if (trace.subPath === undefined || manifest.exports === undefined) {
    return null;
  }

  if (!Array.isArray(manifest.exports)) {
    return null;
  }

  const exportedPaths = new Set(
    manifest.exports
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => normalizeManifestRelativePath(entry)),
  );
  const candidates = getPackageSubpathExportCandidates(trace.subPath);
  const allowedCandidates = candidates.filter((candidate) =>
    exportedPaths.has(candidate),
  );
  if (allowedCandidates.length > 0) {
    return new Set(allowedCandidates);
  }

  trace.failureReason = "subpath-not-found";
  trace.failureCode = "BPL_PACKAGE_SUBPATH_NOT_EXPORTED";
  trace.failureMessage = `Package '${trace.packageName}' exists at ${packageRoot}, but subpath '${trace.subPath}' is not exported by bpl.json. Export one of: ${candidates.join(
    ", ",
  )}.`;
  return false;
}

function getPackageSubpathExportCandidates(subPath: string): string[] {
  const normalizedSubPath = normalizeManifestRelativePath(subPath);
  if (hasPackageSourceExtension(normalizedSubPath)) {
    return [normalizedSubPath];
  }

  return [
    normalizedSubPath,
    `${normalizedSubPath}.bpl`,
    `${normalizedSubPath}.x`,
    `${normalizedSubPath}/index.bpl`,
    `${normalizedSubPath}/index.x`,
  ];
}

function normalizeManifestRelativePath(relativePath: string): string {
  return relativePath.split(/[\\/]/).join("/");
}

function resolvePackageSourcePath(
  filePath: string,
  packageRoot: string,
  trace: PackageResolutionTrace,
  allowedRelativePaths?: ReadonlySet<string>,
): string | null {
  const candidateAllowed = (candidatePath: string): boolean =>
    isPackageSourceCandidateAllowed(
      candidatePath,
      packageRoot,
      allowedRelativePaths,
    );
  const symlinkedParent = findSymlinkedPackageSourceParent(filePath, packageRoot);
  if (symlinkedParent) {
    addEntryCandidate(trace, filePath);
    failOnSymlinkedSourceCandidate(symlinkedParent, trace);
    return null;
  }

  const sourceCaseMismatchPath = findCaseMismatchPath(filePath);
  if (sourceCaseMismatchPath && candidateAllowed(filePath)) {
    addEntryCandidate(trace, filePath);
    failOnCaseMismatchedSourceCandidate(
      filePath,
      sourceCaseMismatchPath,
      trace,
    );
    return null;
  }

  const directStats = tryLstat(filePath);
  if (!directStats && candidateAllowed(filePath)) {
    addEntryCandidate(trace, filePath);
  }
  if (directStats) {
    if (directStats.isSymbolicLink()) {
      if (candidateAllowed(filePath)) {
        addEntryCandidate(trace, filePath);
        failOnSymlinkedSourceCandidate(filePath, trace);
        return null;
      }
    }
    if (directStats.isFile() && candidateAllowed(filePath)) {
      addEntryCandidate(trace, filePath);
      return filePath;
    }
    if (directStats.isDirectory()) {
      if (hasPackageSourceExtension(filePath) && candidateAllowed(filePath)) {
        addEntryCandidate(trace, filePath);
        failOnExplicitSourceFileDirectory(filePath, packageRoot, trace);
        return null;
      }

      for (const indexName of ["index.bpl", "index.x"]) {
        const indexPath = path.join(filePath, indexName);
        if (!candidateAllowed(indexPath)) continue;
        addEntryCandidate(trace, indexPath);
        const indexCaseMismatchPath = findCaseMismatchPath(indexPath);
        if (indexCaseMismatchPath) {
          failOnCaseMismatchedSourceCandidate(
            indexPath,
            indexCaseMismatchPath,
            trace,
          );
          return null;
        }
        const indexStats = tryLstat(indexPath);
        if (indexStats?.isSymbolicLink()) {
          failOnSymlinkedSourceCandidate(indexPath, trace);
          return null;
        }
        if (indexStats?.isFile()) {
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
    if (!candidateAllowed(fullPath)) continue;
    addEntryCandidate(trace, fullPath);
    const fullPathCaseMismatchPath = findCaseMismatchPath(fullPath);
    if (fullPathCaseMismatchPath) {
      failOnCaseMismatchedSourceCandidate(
        fullPath,
        fullPathCaseMismatchPath,
        trace,
      );
      return null;
    }
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

function isPackageSourceCandidateAllowed(
  candidatePath: string,
  packageRoot: string,
  allowedRelativePaths?: ReadonlySet<string>,
): boolean {
  if (!allowedRelativePaths) return true;

  const relativePath = path.relative(packageRoot, candidatePath);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return false;
  }

  return allowedRelativePaths.has(normalizeManifestRelativePath(relativePath));
}

function hasPackageSourceExtension(filePath: string): boolean {
  return filePath.endsWith(".bpl") || filePath.endsWith(".x");
}

function failOnExplicitSourceFileDirectory(
  candidatePath: string,
  packageRoot: string,
  trace: PackageResolutionTrace,
): void {
  const relativePath = path
    .relative(packageRoot, candidatePath)
    .split(path.sep)
    .join("/");
  const subject = trace.subPath
    ? `subpath '${trace.subPath}'`
    : `entrypoint '${relativePath}'`;
  trace.failureReason = trace.subPath
    ? "subpath-not-found"
    : "entrypoint-not-found";
  trace.failureCode = trace.subPath
    ? "BPL_PACKAGE_SUBPATH_NOT_FOUND"
    : "BPL_PACKAGE_ENTRYPOINT_NOT_FOUND";
  const guidance =
    "explicit package source-file imports ending in .bpl or .x do not fall back to directory indexes";
  trace.failureMessage = `Package '${trace.packageName}' exists at ${packageRoot}, but ${subject} was not found because it resolves to a directory at ${candidatePath}; ${guidance}. Import the extensionless directory path to allow index.bpl/index.x fallback, or create a source file at ${candidatePath}.`;
}

function addEntryCandidate(
  trace: PackageResolutionTrace,
  candidatePath: string,
): void {
  if (!trace.entryCandidates.includes(candidatePath)) {
    trace.entryCandidates.push(candidatePath);
  }
}

function findSymlinkedPackageSourceParent(
  filePath: string,
  packageRoot: string,
): string | null {
  const relativePath = path.relative(packageRoot, filePath);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  const parts = relativePath.split(path.sep).filter((part) => part.length > 0);
  let currentPath = packageRoot;
  for (const part of parts.slice(0, -1)) {
    currentPath = path.join(currentPath, part);
    const stats = tryLstat(currentPath);
    if (stats?.isSymbolicLink()) {
      return currentPath;
    }
    if (stats && !stats.isDirectory()) {
      return null;
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
    trace.failureCode = "BPL_PACKAGE_SUBPATH_SYMLINK";
    trace.failureMessage = `Package '${trace.packageName}' subpath '${trace.subPath}' resolves to a symbolic link candidate: ${filePath}.`;
    return;
  }

  trace.failureReason = "entrypoint-not-found";
  trace.failureCode = "BPL_PACKAGE_ENTRYPOINT_SYMLINK";
  trace.failureMessage = `Package '${trace.packageName}' entrypoint resolves to a symbolic link candidate: ${filePath}.`;
}

function failOnCaseMismatchedSourceCandidate(
  requestedPath: string,
  actualPath: string,
  trace: PackageResolutionTrace,
): void {
  if (trace.subPath) {
    trace.failureReason = "subpath-not-found";
    trace.failureCode = "BPL_PACKAGE_SUBPATH_CASE_MISMATCH";
    trace.failureMessage = `Package '${trace.packageName}' subpath '${trace.subPath}' casing does not match filesystem: requested ${requestedPath}, actual ${actualPath}.`;
    return;
  }

  trace.failureReason = "entrypoint-not-found";
  trace.failureCode = "BPL_PACKAGE_ENTRYPOINT_CASE_MISMATCH";
  trace.failureMessage = `Package '${trace.packageName}' entrypoint casing does not match filesystem: requested ${requestedPath}, actual ${actualPath}.`;
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

function isSafeBinCommandName(commandName: string): boolean {
  return (
    commandName.length > 0 &&
    commandName !== "." &&
    commandName !== ".." &&
    !commandName.includes("/") &&
    !commandName.includes("\\")
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

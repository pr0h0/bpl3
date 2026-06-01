import { createHash } from "crypto";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  type Stats,
  writeFileSync,
} from "fs";
import { basename, dirname, join, relative, resolve } from "path";
import { spawnSync } from "child_process";
import {
  findNonDirectoryPathComponent,
  findSymlinkedPathComponent,
} from "../compiler/common/PathSafety";

export interface ReleaseManifestArtifact {
  kind: "binary" | "runtime" | "helper" | "npm-package";
  path: string;
  bytes: number;
  sha256: string;
  npmIntegrity?: string;
  npmShasum?: string;
}

export interface ReleaseManifest {
  schemaVersion: 1;
  generatedAt: string;
  package: {
    name: string;
    version: string;
    license: string;
  };
  artifacts: ReleaseManifestArtifact[];
}

export interface NpmPackageMetadata {
  filename: string;
  integrity?: string;
  shasum?: string;
}

export interface CreateReleaseManifestOptions {
  repoRoot: string;
  generatedAt?: string;
  npmPackage?: {
    path: string;
    metadata?: NpmPackageMetadata;
  };
}

interface PackageJson {
  name: string;
  version: string;
  license: string;
  scripts?: Record<string, string>;
  files?: string[];
}

export interface PackageScriptHelperReference {
  scriptName: string;
  helperPath: string;
  script: string;
}

export interface PackageHelperDependency {
  path: string;
  importedBy: readonly string[];
  reason: string;
}

export const PACKAGE_HELPER_DEPENDENCIES = [
  {
    importedBy: [
      "tools/fuzz_artifact_repro.ts",
      "tools/release_manifest.ts",
    ],
    path: "compiler/common/PathSafety.ts",
    reason:
      "Packed helper scripts share symlink-safe path validation without shipping broad compiler sources.",
  },
] as const satisfies readonly PackageHelperDependency[];

export function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function createReleaseManifest(
  options: CreateReleaseManifestOptions,
): ReleaseManifest {
  const repoRoot = resolve(options.repoRoot);
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf-8"),
  ) as PackageJson;

  const binaryName = process.platform === "win32" ? "bpl.exe" : "bpl";
  const artifacts: ReleaseManifestArtifact[] = [
    artifactFor(repoRoot, join(repoRoot, binaryName), "binary"),
    artifactFor(repoRoot, join(repoRoot, "lib", "runtime.ll"), "runtime"),
    artifactFor(
      repoRoot,
      join(repoRoot, "lib", "runtime_wasm.ll"),
      "runtime",
    ),
    artifactFor(
      repoRoot,
      join(repoRoot, "lib", "runtime_wasm_host.ll"),
      "runtime",
    ),
    artifactFor(
      repoRoot,
      join(repoRoot, "lib", "runtime_support.o"),
      "runtime",
    ),
  ];
  const packageHelperFiles = discoverPackageScriptHelperFiles(repoRoot);
  const packageHelperDependencyFiles = discoverPackageHelperDependencyFiles(
    repoRoot,
    packageHelperFiles,
  );
  const helperArtifactFiles = [
    ...new Set([...packageHelperFiles, ...packageHelperDependencyFiles]),
  ].sort();
  for (const helperFile of helperArtifactFiles) {
    artifacts.push(artifactFor(repoRoot, join(repoRoot, helperFile), "helper"));
  }

  if (options.npmPackage) {
    const npmArtifact = artifactFor(
      repoRoot,
      options.npmPackage.path,
      "npm-package",
    );
    const metadata = options.npmPackage.metadata;
    if (metadata?.integrity) {
      npmArtifact.npmIntegrity = metadata.integrity;
    }
    if (metadata?.shasum) {
      npmArtifact.npmShasum = metadata.shasum;
    }
    artifacts.push(npmArtifact);
  }

  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    package: {
      name: packageJson.name,
      version: packageJson.version,
      license: packageJson.license,
    },
    artifacts,
  };
}

export function discoverPackageScriptHelperFiles(repoRoot: string): string[] {
  return [
    ...new Set(
      discoverPackageScriptHelperReferences(repoRoot).map(
        (reference) => reference.helperPath,
      ),
    ),
  ].sort();
}

export function discoverPackageScriptHelperReferences(
  repoRoot: string,
): PackageScriptHelperReference[] {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf-8"),
  ) as PackageJson;
  const references: PackageScriptHelperReference[] = [];

  for (const [scriptName, script] of Object.entries(packageJson.scripts ?? {})) {
    for (const helperPath of findBunToolScriptPaths(script)) {
      const stats = tryLstat(join(repoRoot, helperPath));
      if (!stats?.isFile()) {
        throw new Error(
          `Package script helper file is missing or not a file: ${helperPath} (referenced by script ${scriptName})`,
        );
      }
      references.push({ scriptName, helperPath, script });
    }
  }

  return references.sort((left, right) => {
    const scriptOrder = left.scriptName.localeCompare(right.scriptName);
    return scriptOrder === 0
      ? left.helperPath.localeCompare(right.helperPath)
      : scriptOrder;
  });
}

export function discoverPackageHelperDependencyFiles(
  repoRoot: string,
  packageHelperFiles: readonly string[] = discoverPackageScriptHelperFiles(
    repoRoot,
  ),
  packageHelperDependencies: readonly PackageHelperDependency[] =
    PACKAGE_HELPER_DEPENDENCIES,
): string[] {
  const packageHelperFileSet = new Set(packageHelperFiles);
  const dependencyFiles = new Set<string>();

  for (const dependency of packageHelperDependencies) {
    const dependencyStats = tryLstat(join(repoRoot, dependency.path));
    if (!dependencyStats?.isFile()) {
      throw new Error(
        `Package helper dependency file is missing or not a file: ${dependency.path}`,
      );
    }

    for (const importer of dependency.importedBy) {
      if (!packageHelperFileSet.has(importer)) {
        throw new Error(
          [
            "Package helper dependency importer is not shipped as a package helper.",
            `dependency: ${dependency.path}`,
            `importer: ${importer}`,
          ].join("\n"),
        );
      }
      assertPackageHelperImportsDependency(repoRoot, importer, dependency.path);
    }

    dependencyFiles.add(dependency.path);
  }

  return [...dependencyFiles].sort();
}

export function discoverPackedToolPayloadFiles(repoRoot: string): string[] {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "package.json"), "utf-8"),
  ) as PackageJson;
  const toolsDir = join(repoRoot, "tools");

  if (!tryLstat(toolsDir)?.isDirectory()) {
    return [];
  }

  return readdirSync(toolsDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => `tools/${name}`)
    .filter((toolPath) =>
      isIncludedInPackageFiles(toolPath, packageJson.files ?? []),
    )
    .sort();
}

export function findUnaccountedPackedToolPayloadFiles(
  repoRoot: string,
  explicitlyOwnedToolFiles: readonly string[] = PACKAGE_HELPER_DEPENDENCIES.map(
    ({ path }) => path,
  ).filter((path) => path.startsWith("tools/")),
): string[] {
  const ownedToolFiles = new Set([
    ...discoverPackageScriptHelperFiles(repoRoot),
    ...explicitlyOwnedToolFiles,
  ]);

  return discoverPackedToolPayloadFiles(repoRoot).filter(
    (toolPath) => !ownedToolFiles.has(toolPath),
  );
}

export function formatUnaccountedPackedToolPayloadDiagnostics(
  unaccountedToolFiles: readonly string[],
): string {
  if (unaccountedToolFiles.length === 0) {
    return "";
  }

  return [
    "Unaccounted packed tools payload:",
    ...[...unaccountedToolFiles].sort().map((toolPath) => `- ${toolPath}`),
    "Move test-only helpers under tests/helpers or add an explicit release ownership rule.",
  ].join("\n");
}

export function writeReleaseManifest(
  outPath: string,
  options: CreateReleaseManifestOptions,
): ReleaseManifest {
  const manifest = createReleaseManifest(options);
  assertWritableManifestPath(outPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function artifactFor(
  repoRoot: string,
  filePath: string,
  kind: ReleaseManifestArtifact["kind"],
): ReleaseManifestArtifact {
  const stats = tryLstat(filePath);
  if (!stats) {
    throw new Error(`Release artifact is missing: ${filePath}`);
  }

  if (stats.isSymbolicLink()) {
    throw new Error(`Release artifact is a symbolic link: ${filePath}`);
  }
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`Release artifact is not a non-empty file: ${filePath}`);
  }

  const relPath = relative(repoRoot, filePath).split(/[\\/]+/).join("/");
  return {
    kind,
    path: relPath.startsWith("..") ? basename(filePath) : relPath,
    bytes: stats.size,
    sha256: sha256File(filePath),
  };
}

function findBunToolScriptPaths(script: string): string[] {
  const tokens = script.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const helperFiles: string[] = [];

  for (let index = 0; index < tokens.length - 1; index++) {
    const token = unquoteShellToken(tokens[index] ?? "");
    const nextToken = unquoteShellToken(tokens[index + 1] ?? "");
    if (token === "bun" && /^tools\/[A-Za-z0-9_./-]+\.ts$/.test(nextToken)) {
      helperFiles.push(nextToken);
    }
  }

  return helperFiles;
}

function isIncludedInPackageFiles(
  filePath: string,
  packageFiles: readonly string[],
): boolean {
  return packageFiles.some(
    (entry) => filePath === entry || filePath.startsWith(`${entry}/`),
  );
}

function unquoteShellToken(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }

  return token;
}

function assertPackageHelperImportsDependency(
  repoRoot: string,
  importer: string,
  dependencyPath: string,
): void {
  const importerPath = join(repoRoot, importer);
  const importerStats = tryLstat(importerPath);
  if (!importerStats?.isFile()) {
    throw new Error(
      `Package helper dependency importer is missing or not a file: ${importer}`,
    );
  }

  const source = readFileSync(importerPath, "utf-8");
  const importSpecifiers = packageImportSpecifiers(importer, dependencyPath);
  const sourceImportSpecifiers = importedModuleSpecifiers(source);
  const importsDependency = importSpecifiers.some(
    (specifier) => sourceImportSpecifiers.has(specifier),
  );
  if (!importsDependency) {
    throw new Error(
      [
        "Package helper dependency importer does not import the declared dependency.",
        `dependency: ${dependencyPath}`,
        `importer: ${importer}`,
        `expected import: ${importSpecifiers.join(" or ")}`,
      ].join("\n"),
    );
  }
}

function packageImportSpecifiers(
  importer: string,
  dependencyPath: string,
): string[] {
  const specifier = packageImportSpecifier(importer, dependencyPath);
  const specifiers = new Set([
    specifier,
    `${specifier}.ts`,
    `${specifier}.js`,
  ]);

  if (basename(dependencyPath) === "index.ts") {
    const directorySpecifier = packageImportSpecifier(
      importer,
      dirname(dependencyPath),
    );
    specifiers.add(directorySpecifier);
    specifiers.add(`${directorySpecifier}/index`);
    specifiers.add(`${directorySpecifier}/index.ts`);
    specifiers.add(`${directorySpecifier}/index.js`);
  }

  return [...specifiers];
}

function packageImportSpecifier(importer: string, dependencyPath: string): string {
  const specifier = relative(dirname(importer), dependencyPath)
    .split(/[\\/]+/)
    .join("/");
  const relativeSpecifier = specifier.startsWith(".")
    ? specifier
    : `./${specifier}`;
  return relativeSpecifier.endsWith(".ts")
    ? relativeSpecifier.slice(0, -".ts".length)
    : relativeSpecifier;
}

function importedModuleSpecifiers(source: string): Set<string> {
  const specifiers = new Set<string>();
  const patterns = [
    /\bimport\s+(?:[^"'()]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+[^"']*?\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }

  return specifiers;
}

function assertWritableManifestPath(outPath: string): void {
  const stats = tryLstat(outPath);
  if (stats) {
    if (stats.isSymbolicLink()) {
      throw new Error(`Release manifest output is a symbolic link: ${outPath}`);
    }
    if (!stats.isFile()) {
      throw new Error(`Release manifest output is not a file: ${outPath}`);
    }
  }

  assertWritableManifestParent(outPath);
}

function assertWritableManifestParent(outPath: string): void {
  const outputDir = dirname(resolve(outPath));
  const symlinkedParent = findSymlinkedPathComponent(outputDir);
  if (symlinkedParent) {
    if (symlinkedParent === outputDir) {
      throw new Error(
        `Release manifest output directory is a symbolic link: ${symlinkedParent}`,
      );
    }

    throw new Error(
      `Release manifest output parent contains a symbolic link: ${symlinkedParent}`,
    );
  }

  const nonDirectoryParent = findNonDirectoryPathComponent(outputDir);
  if (nonDirectoryParent) {
    throw new Error(
      `Release manifest output parent is not a directory: ${nonDirectoryParent}`,
    );
  }
}

function tryLstat(filePath: string): Stats | null {
  try {
    return lstatSync(filePath);
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

function parsePackJson(stdout: string): NpmPackageMetadata {
  const entries = JSON.parse(stdout) as NpmPackageMetadata[];
  const entry = entries[0];
  if (!Array.isArray(entries) || !entry?.filename) {
    throw new Error("npm pack JSON did not contain a package filename.");
  }
  return entry;
}

function parseArgs(argv: string[]): {
  outPath: string;
  packNpm: boolean;
  repoRoot: string;
} {
  let outPath = "dist/release-manifest.json";
  let packNpm = false;
  let repoRoot = resolve(import.meta.dir, "..");

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out" && argv[i + 1]) {
      outPath = argv[++i]!;
    } else if (arg === "--pack-npm") {
      packNpm = true;
    } else if (arg === "--repo-root" && argv[i + 1]) {
      repoRoot = resolve(argv[++i]!);
    } else {
      throw new Error(`Unknown release manifest option: ${arg}`);
    }
  }

  return { outPath: resolve(repoRoot, outPath), packNpm, repoRoot };
}

if (import.meta.main) {
  try {
    const { outPath, packNpm, repoRoot } = parseArgs(process.argv.slice(2));
    let npmPackage: CreateReleaseManifestOptions["npmPackage"];

    if (packNpm) {
      mkdirSync(dirname(outPath), { recursive: true });
      const pack = spawnSync(
        "npm",
        ["pack", "--json", "--pack-destination", dirname(outPath)],
        {
          cwd: repoRoot,
          encoding: "utf-8",
          stdio: "pipe",
        },
      );
      if (pack.error) throw pack.error;
      if (pack.status !== 0) {
        throw new Error(
          [
            "npm pack failed while creating release manifest.",
            `stdout:\n${pack.stdout}`,
            `stderr:\n${pack.stderr}`,
          ].join("\n"),
        );
      }

      const metadata = parsePackJson(pack.stdout);
      npmPackage = {
        path: join(dirname(outPath), metadata.filename),
        metadata,
      };
    }

    writeReleaseManifest(outPath, { repoRoot, npmPackage });
    console.log(`Release manifest written to ${outPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

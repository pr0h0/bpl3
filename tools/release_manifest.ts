import { createHash } from "crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  type Stats,
  writeFileSync,
} from "fs";
import { basename, dirname, join, relative, resolve } from "path";
import { spawnSync } from "child_process";

export interface ReleaseManifestArtifact {
  kind: "binary" | "runtime" | "npm-package";
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
}

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

  const parentPath = dirname(outPath);
  const parentStats = tryLstat(parentPath);
  if (parentStats) {
    if (parentStats.isSymbolicLink()) {
      throw new Error(
        `Release manifest output directory is a symbolic link: ${parentPath}`,
      );
    }
    if (!parentStats.isDirectory()) {
      throw new Error(
        `Release manifest output parent is not a directory: ${parentPath}`,
      );
    }
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
      error.code === "ENOENT"
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

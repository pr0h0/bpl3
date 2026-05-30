/**
 * BPL Package Manager
 *
 * Handles packaging, installation, and dependency management for BPL projects.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CompilerError, type SourceLocation } from "../common/CompilerError";
import { compilerLog } from "../common/Logger";
import {
  resolvePackageImport,
  type PackageResolutionDetails,
} from "./PackageResolver";
import type { PackageOptionsGlobal, PackageOptionsVerbose } from "../../cli";

export interface PackageManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  main?: string;
  exports?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  bin?: Record<string, string>;
  repository?: {
    type: string;
    url: string;
  };
  keywords?: string[];
}

export interface PackageInfo {
  manifest: PackageManifest;
  path: string;
  hash: string;
}

export interface PackageLockFile {
  lockfileVersion: 1;
  packages: Record<
    string,
    {
      version: string;
      source: string;
      hash: string;
    }
  >;
}

export interface PackageLockVerification {
  ok: boolean;
  errors: string[];
  packagesChecked: number;
}

export class PackageManager {
  private projectRoot: string;
  private globalPackageDir: string;
  private localPackageDir: string;
  private globalBinDir: string;
  private localBinDir: string;

  constructor(projectRoot?: string) {
    // Global packages in ~/.bpl/packages
    this.globalPackageDir = path.join(os.homedir(), ".bpl", "packages");
    this.globalBinDir = path.join(os.homedir(), ".bpl", "bin");

    // Local packages in project's node_modules equivalent
    const root = projectRoot || process.cwd();
    this.projectRoot = root;
    this.localPackageDir = path.join(root, "bpl_modules");
    this.localBinDir = path.join(this.localPackageDir, ".bin");

    this.ensureDirectories();
  }

  /**
   * Ensure package directories exist
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.globalPackageDir)) {
      fs.mkdirSync(this.globalPackageDir, { recursive: true });
    }
    if (!fs.existsSync(this.localPackageDir)) {
      fs.mkdirSync(this.localPackageDir, { recursive: true });
    }
  }

  private linkBinaries(
    manifest: PackageManifest,
    installPath: string,
    isGlobal: boolean,
  ): void {
    if (!manifest.bin) return;

    const binDir = isGlobal ? this.globalBinDir : this.localBinDir;
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    for (const [name, relativePath] of Object.entries(manifest.bin)) {
      if (
        !this.isSafeBinCommandName(name) ||
        !this.isSafePackageRelativePath(relativePath)
      ) {
        throw new CompilerError(
          "Invalid 'bin' field",
          "'bin' entries must use safe command names and package-relative executable paths.",
          {
            file: path.join(installPath, "bpl.json"),
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      const sourcePath = this.resolvePackageRelativePath(
        installPath,
        relativePath,
      );
      const targetPath = path.join(binDir, name);

      // Remove existing link/file
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }

      // Ensure source is executable
      if (process.platform !== "win32") {
        try {
          fs.chmodSync(sourcePath, "755");
        } catch {
          // Permission errors can occur on read-only filesystems or when lacking privileges
          // This is non-critical as the file may already be executable
        }
      }

      // Create symlink
      try {
        fs.symlinkSync(sourcePath, targetPath);
      } catch (e) {
        compilerLog.warn(
          `Failed to link binary ${name}: ${(e as Error).message}`,
        );
      }
    }
  }

  private getLockFilePath(): string {
    return path.join(this.projectRoot, "bpl.lock");
  }

  loadLockFile(): PackageLockFile {
    const lockPath = this.getLockFilePath();
    if (!fs.existsSync(lockPath)) {
      return { lockfileVersion: 1, packages: {} };
    }

    const parsed = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    return {
      lockfileVersion: 1,
      packages: parsed.packages || {},
    };
  }

  private saveLockFile(lock: PackageLockFile): void {
    fs.writeFileSync(this.getLockFilePath(), JSON.stringify(lock, null, 2));
  }

  private recordLocalInstall(
    manifest: PackageManifest,
    installPath: string,
    source: string,
  ): void {
    const lock = this.loadLockFile();
    lock.packages[manifest.name] = {
      version: manifest.version,
      source,
      hash: this.calculatePackageHash(installPath),
    };
    this.saveLockFile(lock);
  }

  verifyLockFile(): PackageLockVerification {
    const lockPath = this.getLockFilePath();
    if (!fs.existsSync(lockPath)) {
      return {
        ok: false,
        errors: [`No bpl.lock found in ${this.projectRoot}`],
        packagesChecked: 0,
      };
    }

    const lock = this.loadLockFile();
    const errors: string[] = [];
    let packagesChecked = 0;

    for (const [packageName, entry] of Object.entries(lock.packages)) {
      packagesChecked++;
      const installPath = path.join(this.localPackageDir, packageName);

      if (!fs.existsSync(installPath)) {
        errors.push(`${packageName}: package is missing from bpl_modules`);
        continue;
      }

      let manifest: PackageManifest;
      try {
        manifest = this.loadManifest(installPath);
      } catch (error) {
        errors.push(
          `${packageName}: invalid installed package (${error instanceof Error ? error.message : String(error)})`,
        );
        continue;
      }

      if (manifest.version !== entry.version) {
        errors.push(
          `${packageName}: version mismatch, lock has ${entry.version} but installed package has ${manifest.version}`,
        );
      }

      const actualHash = this.calculatePackageHash(installPath);
      if (actualHash !== entry.hash) {
        errors.push(
          `${packageName}: hash mismatch, lock has ${entry.hash} but installed package has ${actualHash}`,
        );
      }
    }

    return {
      ok: errors.length === 0,
      errors,
      packagesChecked,
    };
  }

  installProject(
    options: PackageOptionsVerbose = { verbose: false, global: false },
  ): void {
    if (options.global) {
      throw new CompilerError(
        "Project dependency install cannot be global",
        "Run 'bpl install <package> --global' for a single global package.",
        {
          file: this.projectRoot,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    if (options.locked) {
      const verification = this.verifyLockFile();
      if (!verification.ok) {
        throw new CompilerError(
          `Lockfile verification failed:\n${verification.errors.join("\n")}`,
          "Run 'bpl install' to restore packages from bpl.lock.",
          {
            file: this.getLockFilePath(),
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      compilerLog.info(
        `✓ Lockfile verified (${verification.packagesChecked} package${verification.packagesChecked === 1 ? "" : "s"})`,
      );
      return;
    }

    const lockPath = this.getLockFilePath();
    if (fs.existsSync(lockPath)) {
      const lock = this.loadLockFile();
      const entries = Object.entries(lock.packages);
      if (entries.length > 0) {
        compilerLog.info(`Restoring ${entries.length} locked packages...`);
        for (const [packageName, entry] of entries) {
          if (options.verbose) {
            compilerLog.info(
              `Restoring ${packageName}@${entry.version} from ${entry.source}`,
            );
          }
          this.install(
            this.resolveDependencySource(packageName, entry.source),
            {
              ...options,
              global: false,
              locked: false,
            },
          );
        }
        return;
      }
    }

    const manifest = this.loadManifest(this.projectRoot);
    const deps = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
    };

    if (Object.keys(deps).length === 0) {
      compilerLog.info("No dependencies to install");
      return;
    }

    compilerLog.info(`Installing ${Object.keys(deps).length} dependencies...`);
    for (const [name, source] of Object.entries(deps)) {
      this.install(this.resolveDependencySource(name, source), {
        ...options,
        global: false,
      });
    }
  }

  private resolveDependencySource(packageName: string, source: string): string {
    const fileSource = source.startsWith("file:") ? source.slice(5) : source;
    const projectRelativePath = path.resolve(this.projectRoot, fileSource);

    if (
      fileSource.endsWith(".tgz") ||
      fileSource.startsWith(".") ||
      fileSource.includes(path.sep)
    ) {
      return fs.existsSync(projectRelativePath)
        ? projectRelativePath
        : fileSource;
    }

    if (/^\d+\.\d+\.\d+$/.test(fileSource)) {
      return `${packageName}-${fileSource}.tgz`;
    }

    return packageName;
  }

  private removeLocalLockEntry(packageName: string): void {
    const lockPath = this.getLockFilePath();
    if (!fs.existsSync(lockPath)) return;

    const lock = this.loadLockFile();
    delete lock.packages[packageName];
    this.saveLockFile(lock);
  }

  /**
   * Load package manifest from directory
   */
  loadManifest(packageDir: string): PackageManifest {
    const manifestPath = path.join(packageDir, "bpl.json");
    const location: SourceLocation = {
      file: manifestPath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    };

    if (!fs.existsSync(manifestPath)) {
      throw new CompilerError(
        `No bpl.json found in ${packageDir}`,
        "Run 'bpl init' to create a new package.",
        location,
      );
    }

    try {
      const content = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as PackageManifest;

      // Validate required fields
      if (!manifest.name) {
        throw new CompilerError(
          "Package manifest missing 'name' field",
          "Add a 'name' field to bpl.json.",
          location,
        );
      }
      if (!manifest.version) {
        throw new CompilerError(
          "Package manifest missing 'version' field",
          "Add a 'version' field to bpl.json (e.g., '0.1.0').",
          location,
        );
      }

      // Validate version format
      if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        throw new CompilerError(
          `Invalid version format: ${manifest.version} (expected: X.Y.Z)`,
          "Version must be in semantic versioning format (Major.Minor.Patch).",
          location,
        );
      }

      // Validate name format
      if (!/^[a-z0-9-]+$/.test(manifest.name)) {
        throw new CompilerError(
          `Invalid package name: ${manifest.name} (use lowercase and hyphens only)`,
          "Use kebab-case for package names.",
          location,
        );
      }

      // Validate scripts and bin
      if (
        manifest.scripts &&
        (typeof manifest.scripts !== "object" ||
          Array.isArray(manifest.scripts))
      ) {
        throw new CompilerError(
          "Invalid 'scripts' field",
          "'scripts' must be an object mapping script names to commands.",
          location,
        );
      }
      if (
        manifest.bin &&
        (typeof manifest.bin !== "object" || Array.isArray(manifest.bin))
      ) {
        throw new CompilerError(
          "Invalid 'bin' field",
          "'bin' must be an object mapping command names to executable paths.",
          location,
        );
      }
      this.validateManifestBinEntries(manifest, packageDir, location);

      return manifest;
    } catch (e) {
      if (e instanceof CompilerError) throw e;
      throw new CompilerError(
        `Failed to load package manifest: ${e instanceof Error ? e.message : String(e)}`,
        "Check that bpl.json is valid JSON.",
        location,
      );
    }
  }

  private validateManifestBinEntries(
    manifest: PackageManifest,
    packageDir: string,
    location: SourceLocation,
  ): void {
    if (!manifest.bin) return;

    for (const [commandName, executablePath] of Object.entries(manifest.bin)) {
      if (!this.isSafeBinCommandName(commandName)) {
        throw new CompilerError(
          `Invalid 'bin' command: ${commandName}`,
          "Use a plain command name without path separators.",
          location,
        );
      }

      if (
        typeof executablePath !== "string" ||
        !this.isSafePackageRelativePath(executablePath)
      ) {
        throw new CompilerError(
          `Invalid 'bin' path for ${commandName}: ${String(executablePath)}`,
          "Use a package-relative executable path that does not contain '..'.",
          location,
        );
      }

      const resolvedPath = this.resolvePackageRelativePath(
        packageDir,
        executablePath,
      );
      if (!this.isWithinPackage(packageDir, resolvedPath)) {
        throw new CompilerError(
          `Invalid 'bin' path for ${commandName}: ${executablePath}`,
          "Use a package-relative executable path inside the package root.",
          location,
        );
      }
    }
  }

  private isSafeBinCommandName(commandName: string): boolean {
    return (
      commandName.length > 0 &&
      commandName !== "." &&
      commandName !== ".." &&
      !commandName.includes("/") &&
      !commandName.includes("\\")
    );
  }

  private isSafePackageRelativePath(relativePath: string): boolean {
    if (relativePath.length === 0) return false;
    if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
      return false;
    }

    const parts = relativePath.split(/[\\/]+/);
    return parts.every((part) => part.length > 0 && part !== "..");
  }

  private resolvePackageRelativePath(
    packageDir: string,
    relativePath: string,
  ): string {
    return path.resolve(packageDir, ...relativePath.split(/[\\/]+/));
  }

  /**
   * Calculate hash of package contents
   */
  private calculatePackageHash(packageDir: string): string {
    const hash = crypto.createHash("sha256");
    const packageRoot = path.resolve(packageDir);

    const files = this.getPackageHashFiles(packageRoot);
    files.sort((left, right) =>
      path
        .relative(packageRoot, left)
        .localeCompare(path.relative(packageRoot, right)),
    );

    for (const file of files) {
      const relativePath = path
        .relative(packageRoot, file)
        .split(path.sep)
        .join("/");
      const content = fs.readFileSync(file);
      hash.update(relativePath);
      hash.update("\0");
      hash.update(content);
      hash.update("\0");
    }

    return hash.digest("hex");
  }

  private getPackageHashFiles(packageDir: string): string[] {
    const files = new Set<string>();
    const manifestPath = path.join(packageDir, "bpl.json");

    if (fs.existsSync(manifestPath)) {
      files.add(manifestPath);
    }

    for (const file of this.getAllBplFiles(packageDir)) {
      files.add(file);
    }

    const manifest = this.tryReadManifestJson(manifestPath);
    if (
      manifest?.bin &&
      typeof manifest.bin === "object" &&
      !Array.isArray(manifest.bin)
    ) {
      for (const relativeBinaryPath of Object.values(manifest.bin)) {
        if (typeof relativeBinaryPath !== "string") continue;
        if (!this.isSafePackageRelativePath(relativeBinaryPath)) continue;

        const binaryPath = this.resolvePackageRelativePath(
          packageDir,
          relativeBinaryPath,
        );
        if (!this.isWithinPackage(packageDir, binaryPath)) continue;
        if (fs.existsSync(binaryPath) && fs.statSync(binaryPath).isFile()) {
          files.add(binaryPath);
        }
      }
    }

    return [...files];
  }

  private tryReadManifestJson(
    manifestPath: string,
  ): Partial<PackageManifest> | null {
    try {
      return JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      ) as Partial<PackageManifest>;
    } catch {
      return null;
    }
  }

  private isWithinPackage(packageDir: string, filePath: string): boolean {
    const relativePath = path.relative(packageDir, filePath);
    return (
      relativePath !== "" &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath)
    );
  }

  /**
   * Get all .bpl files in directory recursively
   */
  private getAllBplFiles(dir: string): string[] {
    const files: string[] = [];

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules, bpl_modules, .bpl-cache, etc.
        if (
          item !== "node_modules" &&
          item !== "bpl_modules" &&
          !item.startsWith(".")
        ) {
          files.push(...this.getAllBplFiles(fullPath));
        }
      } else if (item.endsWith(".bpl")) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Copy directory recursively
   */
  private copyDir(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Create a package archive
   */
  pack(packageDir: string, outputDir?: string): string {
    const manifest = this.loadManifest(packageDir);
    const outputPath = outputDir || packageDir;

    // Create tarball filename
    const tarballName = `${manifest.name}-${manifest.version}.tgz`;
    const tarballPath = path.join(outputPath, tarballName);

    compilerLog.info(`Packing ${manifest.name}@${manifest.version}...`);

    // Get files to include
    const files = this.getAllBplFiles(packageDir);

    // Also include 'bin' files
    if (manifest.bin) {
      for (const binaryPath of Object.values(manifest.bin)) {
        const fullPath = this.resolvePackageRelativePath(
          packageDir,
          binaryPath as string,
        );
        if (fs.existsSync(fullPath)) {
          files.push(fullPath);
        } else {
          compilerLog.warn(
            `Warning: Binary '${binaryPath}' not found, skipping.`,
          );
        }
      }
    }

    const manifestPath = path.join(packageDir, "bpl.json");

    if (files.length === 0) {
      throw new CompilerError(
        "No .bpl files found in package",
        "Add some .bpl files to the package directory.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    compilerLog.info(`Including ${files.length} source files`);

    // Create a temporary directory for packing
    const tempDir = path.join(os.tmpdir(), `bpl-pack-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Copy files to temp directory maintaining structure
      const packageRoot = path.join(tempDir, "package");
      fs.mkdirSync(packageRoot, { recursive: true });

      // Copy manifest
      fs.copyFileSync(manifestPath, path.join(packageRoot, "bpl.json"));

      // Copy source files
      for (const file of files) {
        const relativePath = path.relative(packageDir, file);
        const targetPath = path.join(packageRoot, relativePath);
        const targetDir = path.dirname(targetPath);

        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        fs.copyFileSync(file, targetPath);
      }

      // Create tarball
      const result = spawnSync(
        "tar",
        ["-czf", tarballPath, "-C", tempDir, "package"],
        {
          stdio: "pipe",
        },
      );

      if (result.status !== 0) {
        const error = result.stderr?.toString() || "Unknown error";
        throw new CompilerError(
          `Failed to create tarball: ${error}`,
          "Check if 'tar' command is available and you have write permissions.",
          {
            file: manifestPath,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      compilerLog.info(`✓ Package created: ${tarballName}`);

      // Calculate and display size
      const stats = fs.statSync(tarballPath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      compilerLog.info(`Size: ${sizeKB} KB`);

      return tarballPath;
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Install a package from tarball or name
   */
  install(
    packageSource: string,
    options: PackageOptionsVerbose = { verbose: false, global: false },
    installing: Set<string> = new Set(),
  ): void {
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;

    let tarballPath: string;
    let lockSource = packageSource;

    // Check if source is a file path or package name
    if (fs.existsSync(packageSource)) {
      tarballPath = packageSource;
    } else {
      // Look for package in global registry
      const globalTarballPath = this.resolveGlobalPackageSource(packageSource);

      if (!globalTarballPath) {
        throw new CompilerError(
          `Package not found: ${packageSource}`,
          "Check the package name or path.",
          {
            file: packageSource,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      tarballPath = globalTarballPath;
      lockSource = path.basename(globalTarballPath);
    }

    if (options.verbose) {
      compilerLog.info(`Installing from: ${tarballPath}`);
    }

    // Extract to temporary directory first
    const tempDir = path.join(os.tmpdir(), `bpl-install-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      this.validatePackageArchiveMembers(tarballPath);

      // Extract tarball
      const extractResult = spawnSync(
        "tar",
        ["-xzf", tarballPath, "-C", tempDir],
        {
          stdio: options.verbose ? "inherit" : "pipe",
        },
      );

      if (extractResult.status !== 0) {
        const error = extractResult.stderr?.toString() || "Unknown error";
        throw new CompilerError(
          `Failed to extract package: ${error}`,
          "Check if 'tar' command is available.",
          {
            file: tarballPath,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      const packageDir = path.join(tempDir, "package");
      this.validateExtractedPackageTree(packageDir, tarballPath);
      const manifest = this.loadManifest(packageDir);

      if (installing.has(manifest.name)) {
        compilerLog.warn(
          `Skipping cyclic dependency install for ${manifest.name}@${manifest.version}`,
        );
        return;
      }
      installing.add(manifest.name);
      try {
        compilerLog.info(`Installing ${manifest.name}@${manifest.version}...`);

        // Create target directory
        const installPath = path.join(targetDir, manifest.name);

        // Remove existing installation
        if (fs.existsSync(installPath)) {
          fs.rmSync(installPath, { recursive: true, force: true });
        }

        // Copy package to target (use copy instead of rename to avoid cross-device issues)
        fs.mkdirSync(path.dirname(installPath), { recursive: true });
        this.copyDir(packageDir, installPath);

        // Link binaries
        this.linkBinaries(manifest, installPath, options.global || false);

        if (!options.global) {
          this.recordLocalInstall(manifest, installPath, lockSource);
        }

        compilerLog.info(`✓ Installed ${manifest.name}@${manifest.version}`);

        if (options.global) {
          compilerLog.info(`Location: ${installPath}`);
        }

        this.installPackageDependencies(manifest, options, installing);
      } finally {
        installing.delete(manifest.name);
      }
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private installPackageDependencies(
    manifest: PackageManifest,
    options: PackageOptionsVerbose,
    installing: Set<string>,
  ): void {
    const deps = manifest.dependencies || {};
    const entries = Object.entries(deps);
    if (entries.length === 0) return;

    compilerLog.info(
      `Installing ${entries.length} package dependenc${entries.length === 1 ? "y" : "ies"} for ${manifest.name}@${manifest.version}...`,
    );

    for (const [name, source] of entries) {
      if (installing.has(name)) {
        compilerLog.warn(`Skipping cyclic dependency install for ${name}`);
        continue;
      }
      this.install(
        this.resolveDependencySource(name, source),
        {
          ...options,
          locked: false,
        },
        installing,
      );
    }
  }

  private resolveGlobalPackageSource(packageSource: string): string | null {
    const exactTarballPath = path.join(this.globalPackageDir, packageSource);
    if (packageSource.endsWith(".tgz") && fs.existsSync(exactTarballPath)) {
      return exactTarballPath;
    }

    const matching = this.findGlobalPackageTarballs(packageSource);
    if (matching.length === 0) {
      return null;
    }

    return path.join(this.globalPackageDir, matching[0]!.file);
  }

  private validatePackageArchiveMembers(tarballPath: string): void {
    const listResult = spawnSync("tar", ["-tzf", tarballPath], {
      stdio: "pipe",
    });

    if (listResult.status !== 0) {
      const error = listResult.stderr?.toString() || "Unknown error";
      throw new CompilerError(
        `Failed to inspect package archive: ${error}`,
        "Check if the package archive is a valid tarball.",
        {
          file: tarballPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    const members = listResult.stdout
      .toString()
      .split(/\r?\n/)
      .filter((member) => member.length > 0);

    for (const member of members) {
      if (!this.isSafePackageArchiveMember(member)) {
        throw new CompilerError(
          `Unsafe package archive member: ${member}`,
          "Package archives may only contain relative paths inside the package/ directory.",
          {
            file: tarballPath,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }
    }
  }

  private isSafePackageArchiveMember(member: string): boolean {
    const normalized = member.replace(/\/+$/g, "");
    if (normalized.length === 0) return false;
    if (normalized.includes("\\")) return false;
    if (
      path.posix.isAbsolute(normalized) ||
      path.win32.isAbsolute(normalized)
    ) {
      return false;
    }

    const parts = normalized.split("/");
    if (
      parts.some((part) => part.length === 0 || part === "." || part === "..")
    ) {
      return false;
    }

    return normalized === "package" || normalized.startsWith("package/");
  }

  private validateExtractedPackageTree(
    packageDir: string,
    tarballPath: string,
  ): void {
    if (!fs.existsSync(packageDir)) return;

    const packageRoot = fs.realpathSync(packageDir);
    const visit = (currentDir: string) => {
      for (const item of fs.readdirSync(currentDir)) {
        const itemPath = path.join(currentDir, item);
        const stat = fs.lstatSync(itemPath);
        const archivePath = path
          .relative(packageDir, itemPath)
          .split(path.sep)
          .join("/");

        if (stat.isSymbolicLink()) {
          this.throwUnsupportedPackageArchiveEntry(
            tarballPath,
            archivePath,
            "Package archives may not contain symbolic links.",
          );
        }

        const realPath = fs.realpathSync(itemPath);
        if (!this.isWithinPackage(packageRoot, realPath)) {
          this.throwUnsupportedPackageArchiveEntry(
            tarballPath,
            archivePath,
            "Package archive entries must resolve inside the package root.",
          );
        }

        if (stat.isDirectory()) {
          visit(itemPath);
        } else if (!stat.isFile()) {
          this.throwUnsupportedPackageArchiveEntry(
            tarballPath,
            archivePath,
            "Package archives may only contain regular files and directories.",
          );
        }
      }
    };

    visit(packageDir);
  }

  private throwUnsupportedPackageArchiveEntry(
    tarballPath: string,
    archivePath: string,
    help: string,
  ): never {
    throw new CompilerError(
      `Unsupported package archive entry: ${archivePath}`,
      help,
      {
        file: tarballPath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private findGlobalPackageTarballs(packageName: string): Array<{
    file: string;
    version: [number, number, number];
  }> {
    const packagePattern = new RegExp(
      `^${escapeRegExp(packageName)}-(\\d+)\\.(\\d+)\\.(\\d+)\\.tgz$`,
    );

    return fs
      .readdirSync(this.globalPackageDir)
      .map((file) => {
        const match = packagePattern.exec(file);
        if (!match) return null;

        return {
          file,
          version: [Number(match[1]), Number(match[2]), Number(match[3])] as [
            number,
            number,
            number,
          ],
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          file: string;
          version: [number, number, number];
        } => entry !== null,
      )
      .sort((left, right) => compareSemverDesc(left.version, right.version));
  }

  /**
   * Uninstall a package
   */
  uninstall(
    packageName: string,
    options: PackageOptionsGlobal = { global: false },
  ): void {
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    const packagePath = path.join(targetDir, packageName);

    if (!fs.existsSync(packagePath)) {
      throw new CompilerError(
        `Package '${packageName}' is not installed ${options.global ? "globally" : "locally"}`,
        "Check the package name.",
        {
          file: packagePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    // Verify it's actually a package directory
    const manifestPath = path.join(packagePath, "bpl.json");
    if (!fs.existsSync(manifestPath)) {
      throw new CompilerError(
        `Invalid package directory: ${packagePath}`,
        "Directory exists but is not a valid package (missing bpl.json).",
        {
          file: packagePath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    const manifest = this.loadManifest(packagePath);

    // Unlink binaries
    if (manifest.bin) {
      const binDir = options.global ? this.globalBinDir : this.localBinDir;
      for (const name of Object.keys(manifest.bin)) {
        const targetPath = path.join(binDir, name);
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      }
    }

    compilerLog.info(`Uninstalling ${manifest.name}@${manifest.version}...`);

    // Remove the package directory
    fs.rmSync(packagePath, { recursive: true, force: true });

    if (!options.global) {
      this.removeLocalLockEntry(manifest.name);
    }

    compilerLog.info(`✓ Uninstalled ${manifest.name}@${manifest.version}`);
  }

  /**
   * List installed packages
   */
  list(options: PackageOptionsGlobal = { global: false }): PackageInfo[] {
    const searchDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;

    if (!fs.existsSync(searchDir)) {
      return [];
    }

    const packages: PackageInfo[] = [];
    const items = fs.readdirSync(searchDir);

    for (const item of items) {
      const packagePath = path.join(searchDir, item);
      const stat = fs.statSync(packagePath);

      if (stat.isDirectory()) {
        try {
          const manifest = this.loadManifest(packagePath);
          const hash = this.calculatePackageHash(packagePath);

          packages.push({
            manifest,
            path: packagePath,
            hash,
          });
        } catch {
          // Skip invalid packages - they may lack bpl.json or have invalid manifests
        }
      }
    }

    return packages;
  }

  /**
   * Resolve a package import path
   */
  resolvePackage(packageName: string, projectRoot?: string): string | null {
    return this.resolvePackageWithDiagnostics(packageName, projectRoot).result
      ?.filePath ?? null;
  }

  resolvePackageWithDiagnostics(
    packageName: string,
    projectRoot?: string,
  ): PackageResolutionDetails {
    return resolvePackageImport(packageName, projectRoot || process.cwd(), {
      globalPackageDir: this.globalPackageDir,
    });
  }

  /**
   * Initialize a new BPL project
   */
  init(dir: string, name?: string): void {
    const manifestPath = path.join(dir, "bpl.json");
    if (fs.existsSync(manifestPath)) {
      throw new CompilerError(
        `bpl.json already exists in ${dir}`,
        "Delete the existing bpl.json if you want to re-initialize.",
        {
          file: manifestPath,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
        },
      );
    }

    const manifest: PackageManifest = {
      name: name || path.basename(dir),
      version: "1.0.0",
      description: "A BPL project",
      main: "index.bpl",
      dependencies: {},
      devDependencies: {},
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compareSemverDesc(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    const delta = right[i]! - left[i]!;
    if (delta !== 0) return delta;
  }

  return 0;
}

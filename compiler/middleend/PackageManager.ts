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
      const sourcePath = path.resolve(installPath, relativePath);
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

  /**
   * Calculate hash of package contents
   */
  private calculatePackageHash(packageDir: string): string {
    const hash = crypto.createHash("sha256");

    // Get all .bpl files recursively
    const files = this.getAllBplFiles(packageDir);
    files.sort(); // Ensure consistent order

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      hash.update(file.replace(packageDir, "")); // Relative path
      hash.update(content);
    }

    return hash.digest("hex");
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
        const fullPath = path.join(packageDir, binaryPath as string);
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
  ): void {
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;

    let tarballPath: string;

    // Check if source is a file path or package name
    if (fs.existsSync(packageSource)) {
      tarballPath = packageSource;
    } else {
      // Look for package in global registry
      const files = fs.readdirSync(this.globalPackageDir);
      const matching = files.filter(
        (f) => f.startsWith(packageSource) && f.endsWith(".tgz"),
      );

      if (matching.length === 0) {
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

      // Use latest version (simple string sort for now)
      matching.sort();
      tarballPath = path.join(
        this.globalPackageDir,
        matching[matching.length - 1]!,
      );
    }

    if (options.verbose) {
      compilerLog.info(`Installing from: ${tarballPath}`);
    }

    // Extract to temporary directory first
    const tempDir = path.join(os.tmpdir(), `bpl-install-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
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
      const manifest = this.loadManifest(packageDir);

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
        this.recordLocalInstall(manifest, installPath, packageSource);
      }

      compilerLog.info(`✓ Installed ${manifest.name}@${manifest.version}`);

      if (options.global) {
        compilerLog.info(`Location: ${installPath}`);
      }
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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
    const root = projectRoot || process.cwd();

    // Helper to check path
    const checkPath = (baseDir: string): string | null => {
      // Handle "package/subpath"
      // Iterate to find where the package name ends
      const parts = packageName.split("/");

      // Try mostly likely case: first part is package name
      // (Unless scoped packages are supported later)
      if (parts.length > 0) {
        const pkgName = parts[0]!;
        const pkgPath = path.join(baseDir, pkgName);

        if (
          fs.existsSync(pkgPath) &&
          fs.existsSync(path.join(pkgPath, "bpl.json"))
        ) {
          // Found package root
          if (parts.length === 1) {
            // Import "pkg" -> main
            return this.getPackageEntryPoint(pkgPath);
          }
          // Import "pkg/path/file"
          const subPath = parts.slice(1).join("/");
          const fullPath = path.join(pkgPath, subPath);

          // Helper to check extensions
          for (const ext of ["", ".bpl", ".x"]) {
            const tryPath = fullPath + ext;
            if (fs.existsSync(tryPath) && fs.statSync(tryPath).isFile()) {
              return tryPath;
            }
          }
        }
      }
      return null;
    };

    // Check local
    let result = checkPath(path.join(root, "bpl_modules"));
    if (result) return result;

    // Check monorepo/workspace packages, useful for examples and local package development.
    result = checkPath(path.join(root, "packages"));
    if (result) return result;

    // Check global
    result = checkPath(this.globalPackageDir);
    if (result) return result;

    return null;
  }

  private getPackageEntryPoint(packagePath: string): string | null {
    const manifestPath = path.join(packagePath, "bpl.json");
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifest = this.loadManifest(packagePath);
      const entryPoint = manifest.main || "index.bpl";
      const entryPath = path.join(packagePath, entryPoint);

      // Try with different extensions
      for (const ext of [".bpl", ".x", ""]) {
        const fullPath =
          entryPath.endsWith(".bpl") || entryPath.endsWith(".x")
            ? entryPath
            : entryPath + ext;
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }

      return null;
    } catch {
      // Failed to load manifest or find entry point - package may be malformed
      return null;
    }
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

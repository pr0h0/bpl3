/**
 * BPL Package Manager
 *
 * Handles packaging, installation, and dependency management for BPL projects.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import * as os from "os";

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

export class PackageManager {
  private globalPackageDir: string;
  private localPackageDir: string;

  constructor(projectRoot?: string) {
    // Global packages in ~/.bpl/packages
    this.globalPackageDir = path.join(os.homedir(), ".bpl", "packages");

    // Local packages in project's node_modules equivalent
    const root = projectRoot || process.cwd();
    this.localPackageDir = path.join(root, "bpl_modules");

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

  /**
   * Load package manifest from directory
   */
  loadManifest(packageDir: string): PackageManifest {
    const manifestPath = path.join(packageDir, "bpl.json");

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No bpl.json found in ${packageDir}`);
    }

    try {
      const content = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as PackageManifest;

      // Validate required fields
      if (!manifest.name) {
        throw new Error("Package manifest missing 'name' field");
      }
      if (!manifest.version) {
        throw new Error("Package manifest missing 'version' field");
      }

      // Validate version format
      if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
        throw new Error(
          `Invalid version format: ${manifest.version} (expected: X.Y.Z)`,
        );
      }

      // Validate name format
      if (!/^[a-z0-9-]+$/.test(manifest.name)) {
        throw new Error(
          `Invalid package name: ${manifest.name} (use lowercase and hyphens only)`,
        );
      }

      return manifest;
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Failed to load package manifest: ${e.message}`);
      }
      throw e;
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

    console.log(`Packing ${manifest.name}@${manifest.version}...`);

    // Get files to include
    const files = this.getAllBplFiles(packageDir);
    const manifestPath = path.join(packageDir, "bpl.json");

    if (files.length === 0) {
      throw new Error("No .bpl files found in package");
    }

    console.log(`  Including ${files.length} source files`);

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
        throw new Error(`Failed to create tarball: ${error}`);
      }

      console.log(`✓ Package created: ${tarballName}`);

      // Calculate and display size
      const stats = fs.statSync(tarballPath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`  Size: ${sizeKB} KB`);

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
    options: { global?: boolean; verbose?: boolean } = {},
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
        throw new Error(`Package not found: ${packageSource}`);
      }

      // Use latest version (simple string sort for now)
      matching.sort();
      tarballPath = path.join(
        this.globalPackageDir,
        matching[matching.length - 1]!,
      );
    }

    if (options.verbose) {
      console.log(`Installing from: ${tarballPath}`);
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
        throw new Error(`Failed to extract package: ${error}`);
      }

      const packageDir = path.join(tempDir, "package");
      const manifest = this.loadManifest(packageDir);

      console.log(`Installing ${manifest.name}@${manifest.version}...`);

      // Create target directory
      const installPath = path.join(targetDir, manifest.name);

      // Remove existing installation
      if (fs.existsSync(installPath)) {
        fs.rmSync(installPath, { recursive: true, force: true });
      }

      // Copy package to target (use copy instead of rename to avoid cross-device issues)
      fs.mkdirSync(path.dirname(installPath), { recursive: true });
      this.copyDir(packageDir, installPath);

      console.log(`✓ Installed ${manifest.name}@${manifest.version}`);

      if (options.global) {
        console.log(`  Location: ${installPath}`);
      }
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Uninstall a package
   */
  uninstall(packageName: string, options: { global?: boolean } = {}): void {
    const targetDir = options.global
      ? this.globalPackageDir
      : this.localPackageDir;
    const packagePath = path.join(targetDir, packageName);

    if (!fs.existsSync(packagePath)) {
      throw new Error(
        `Package '${packageName}' is not installed ${options.global ? "globally" : "locally"}`,
      );
    }

    // Verify it's actually a package directory
    const manifestPath = path.join(packagePath, "bpl.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Invalid package directory: ${packagePath}`);
    }

    const manifest = this.loadManifest(packagePath);

    console.log(`Uninstalling ${manifest.name}@${manifest.version}...`);

    // Remove the package directory
    fs.rmSync(packagePath, { recursive: true, force: true });

    console.log(`✓ Uninstalled ${manifest.name}@${manifest.version}`);
  }

  /**
   * List installed packages
   */
  list(options: { global?: boolean } = {}): PackageInfo[] {
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
        } catch (e) {
          // Skip invalid packages
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

    // Check local packages first
    const localPath = path.join(root, "bpl_modules", packageName);
    if (fs.existsSync(localPath)) {
      return this.getPackageEntryPoint(localPath);
    }

    // Check global packages
    const globalPath = path.join(this.globalPackageDir, packageName);
    if (fs.existsSync(globalPath)) {
      return this.getPackageEntryPoint(globalPath);
    }

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
    } catch (e) {
      return null;
    }
  }

  /**
   * Initialize a new BPL project
   */
  init(dir: string, name?: string): void {
    const manifestPath = path.join(dir, "bpl.json");
    if (fs.existsSync(manifestPath)) {
      throw new Error(`bpl.json already exists in ${dir}`);
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

/**
 * Module Cache Manager
 *
 * Handles caching of compiled modules to enable incremental compilation.
 * Each module is hashed based on its content, and the compiled object file
 * is cached if unchanged.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";
import type * as AST from "../common/AST";

export interface CachedModule {
  path: string;
  hash: string;
  objectFile: string;
  timestamp: number;
}

export interface CacheManifest {
  version: string;
  modules: Map<string, CachedModule>;
}

export class ModuleCache {
  private cacheDir: string;
  private manifest: CacheManifest;
  private manifestPath: string;

  constructor(projectRoot?: string) {
    // Use project-local cache directory
    const root = projectRoot || process.cwd();
    this.cacheDir = path.join(root, ".bpl-cache");
    this.manifestPath = path.join(this.cacheDir, "manifest.json");

    this.ensureCacheDir();
    this.manifest = this.loadManifest();
  }

  /**
   * Calculate content hash for a module
   */
  private calculateHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Load cache manifest
   */
  private loadManifest(): CacheManifest {
    if (fs.existsSync(this.manifestPath)) {
      try {
        const data = fs.readFileSync(this.manifestPath, "utf-8");
        const parsed = JSON.parse(data);
        return {
          version: parsed.version || "1.0.0",
          modules: new Map(Object.entries(parsed.modules || {})),
        };
      } catch (e) {
        console.warn("Failed to load cache manifest, creating new one");
      }
    }
    return {
      version: "1.0.0",
      modules: new Map(),
    };
  }

  /**
   * Save cache manifest
   */
  private saveManifest(): void {
    const data = {
      version: this.manifest.version,
      modules: Object.fromEntries(this.manifest.modules),
    };
    fs.writeFileSync(this.manifestPath, JSON.stringify(data, null, 2));
  }

  /**
   * Check if a module is cached and up-to-date
   */
  isCached(modulePath: string, content: string): boolean {
    const hash = this.calculateHash(content);
    const cached = this.manifest.modules.get(modulePath);

    if (!cached) {
      return false;
    }

    // Check if hash matches
    if (cached.hash !== hash) {
      return false;
    }

    // Check if object file exists
    if (!fs.existsSync(cached.objectFile)) {
      return false;
    }

    return true;
  }

  /**
   * Get cached object file path
   */
  getCachedObjectFile(modulePath: string): string | null {
    const cached = this.manifest.modules.get(modulePath);
    if (cached && fs.existsSync(cached.objectFile)) {
      return cached.objectFile;
    }
    return null;
  }

  /**
   * Compile module to object file
   */
  compileModule(
    modulePath: string,
    content: string,
    llvmIR: string,
    verbose: boolean = false,
  ): string {
    const hash = this.calculateHash(content);
    const objectFileName = `${hash}.o`;
    const objectFilePath = path.join(this.cacheDir, objectFileName);

    // Check if already cached
    if (this.isCached(modulePath, content)) {
      if (verbose) {
        console.log(`  Using cached: ${path.basename(modulePath)}`);
      }
      return this.getCachedObjectFile(modulePath)!;
    }

    if (verbose) {
      console.log(`  Compiling: ${path.basename(modulePath)}`);
    }

    // Write LLVM IR to temporary file
    const llFilePath = path.join(this.cacheDir, `${hash}.ll`);
    fs.writeFileSync(llFilePath, llvmIR);

    // Compile to object file using clang
    const result = spawnSync(
      "clang",
      ["-c", "-Wno-override-module", llFilePath, "-o", objectFilePath],
      {
        stdio: verbose ? "inherit" : "pipe",
      },
    );

    if (result.status !== 0) {
      const error = result.stderr?.toString() || "Unknown compilation error";
      throw new Error(`Failed to compile ${modulePath}: ${error}`);
    }

    // Clean up temporary LLVM IR file
    try {
      fs.unlinkSync(llFilePath);
    } catch (e) {
      // Ignore cleanup errors
    }

    // Update manifest
    this.manifest.modules.set(modulePath, {
      path: modulePath,
      hash,
      objectFile: objectFilePath,
      timestamp: Date.now(),
    });
    this.saveManifest();

    return objectFilePath;
  }

  /**
   * Link object files into executable
   */
  linkModules(
    objectFiles: string[],
    outputPath: string,
    verbose: boolean = false,
  ): void {
    if (verbose) {
      console.log(`Linking ${objectFiles.length} modules...`);
    }

    const result = spawnSync("clang", [...objectFiles, "-o", outputPath], {
      stdio: verbose ? "inherit" : "pipe",
    });

    if (result.status !== 0) {
      const error = result.stderr?.toString() || "Unknown linking error";
      throw new Error(`Failed to link modules: ${error}`);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    }
    this.ensureCacheDir();
    this.manifest = {
      version: "1.0.0",
      modules: new Map(),
    };
    this.saveManifest();
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalModules: number; cacheSize: number } {
    let totalSize = 0;
    for (const cached of this.manifest.modules.values()) {
      if (fs.existsSync(cached.objectFile)) {
        const stats = fs.statSync(cached.objectFile);
        totalSize += stats.size;
      }
    }
    return {
      totalModules: this.manifest.modules.size,
      cacheSize: totalSize,
    };
  }
}

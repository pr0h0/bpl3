/**
 * Module Cache Manager
 *
 * Handles caching of compiled modules to enable incremental compilation.
 * Each module is hashed based on its content, and the compiled object file
 * is cached if unchanged.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { CompilerError } from "../common/CompilerError";
import { compilerLog } from "../common/Logger";

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
      } catch (_e) {
        compilerLog.warn("Failed to load cache manifest, creating new one");
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
    target?: string,
  ): string {
    // Include target in hash to ensure different targets get different cache entries
    const contentToHash = target ? `${content}|${target}` : content;
    const hash = this.calculateHash(contentToHash);
    const objectFileName = `${hash}.o`;
    const objectFilePath = path.join(this.cacheDir, objectFileName);

    // Check if already cached
    // We use the modified hash, so isCached needs to know about it or we check manually
    // Since isCached calls calculateHash(content), we can't use it directly if we change hashing logic
    // Let's check manually here using our new hash
    const cached = this.manifest.modules.get(modulePath);
    if (cached && cached.hash === hash && fs.existsSync(cached.objectFile)) {
      if (verbose) {
        compilerLog.info(`Using cached: ${path.basename(modulePath)}`);
      }
      return cached.objectFile;
    }

    if (verbose) {
      compilerLog.info(`Compiling: ${path.basename(modulePath)}`);
    }

    // Write LLVM IR to temporary file
    const llFilePath = path.join(this.cacheDir, `${hash}.ll`);
    fs.writeFileSync(llFilePath, llvmIR);

    // Compile to object file using clang
    const clangArgs = ["-c", "-Wno-override-module"];
    if (target) {
      clangArgs.push("-target", target);
    }
    clangArgs.push(llFilePath, "-o", objectFilePath);

    const result = spawnSync("clang", clangArgs, {
      stdio: verbose ? "inherit" : "pipe",
    });

    if (result.status !== 0) {
      const error = result.stderr?.toString() || "Unknown compilation error";
      throw new CompilerError(
        `Failed to compile ${modulePath}: ${error}`,
        "Check clang output for details.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    // Clean up temporary LLVM IR file
    try {
      fs.unlinkSync(llFilePath);
    } catch (_e) {
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
    target?: string,
  ): void {
    if (verbose) {
      compilerLog.info(`Linking ${objectFiles.length} modules...`);
    }

    const clangArgs = [...objectFiles, "-o", outputPath];
    if (target) {
      clangArgs.unshift("-target", target);
    }

    const result = spawnSync("clang", clangArgs, {
      stdio: verbose ? "inherit" : "pipe",
    });

    if (result.status !== 0) {
      const error = result.stderr?.toString() || "Unknown linking error";
      throw new CompilerError(
        `Failed to link modules: ${error}`,
        "Check linker output for details.",
        {
          file: outputPath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
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

/**
 * Module Cache Manager
 *
 * Handles caching of compiled modules to enable incremental compilation.
 * Each module is hashed based on its content, and the compiled object file
 * is cached if unchanged.
 */

import { spawn, spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { getCompilerDriver, isWasmTarget } from "../common/CompilerDriver";
import { CompilerError } from "../common/CompilerError";
import { compilerLog } from "../common/Logger";
import { getNativeLinkerFlags } from "../common/NativeLinkerFlags";

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

export interface ModuleCompileInput {
  modulePath: string;
  content: string;
  llvmIR: string;
  target?: string;
  sysroot?: string;
  clangFlags?: string[];
  optimizationLevel?: number;
}

export interface ModuleCompileBatchOptions {
  jobs?: number;
  verbose?: boolean;
  target?: string;
  sysroot?: string;
  clangFlags?: string[];
  optimizationLevel?: number;
}

export interface ModuleCacheStats {
  totalModules: number;
  cacheSize: number;
  hits: number;
  misses: number;
  compiled: number;
  reused: number;
  jobs: number;
}

export interface ModuleLinkOptions {
  objectFiles?: string[];
  libraries?: string[];
  libraryPaths?: string[];
  sysroot?: string;
  clangFlags?: string[];
}

export class ModuleCache {
  private cacheDir: string;
  private manifest: CacheManifest;
  private manifestPath: string;
  private lastStats: ModuleCacheStats = {
    totalModules: 0,
    cacheSize: 0,
    hits: 0,
    misses: 0,
    compiled: 0,
    reused: 0,
    jobs: 1,
  };

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
    if (
      fs.existsSync(this.cacheDir) &&
      !fs.statSync(this.cacheDir).isDirectory()
    ) {
      throw new CompilerError(
        `Module cache path is not a directory: ${this.cacheDir}`,
        "Remove the file or configure a project directory where .bpl-cache can be a directory.",
        {
          file: this.cacheDir,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Load cache manifest
   */
  private loadManifest(): CacheManifest {
    if (fs.existsSync(this.manifestPath)) {
      if (!fs.statSync(this.manifestPath).isFile()) {
        throw new CompilerError(
          `Module cache manifest path is not a file: ${this.manifestPath}`,
          "Remove the path so the compiler can recreate the cache manifest.",
          {
            file: this.manifestPath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      try {
        const data = fs.readFileSync(this.manifestPath, "utf-8");
        const parsed = JSON.parse(data);
        return {
          version: parsed.version || "1.0.0",
          modules: new Map(Object.entries(parsed.modules || {})),
        };
      } catch {
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

  private getModuleHash(
    content: string,
    target?: string,
    optimizationLevel?: number,
    options: { sysroot?: string; clangFlags?: string[] } = {},
  ): string {
    return this.calculateHash(
      JSON.stringify({
        content,
        target: target ?? "",
        optimizationLevel: optimizationLevel ?? 0,
        compilerDriver: getCompilerDriver(target),
        sysroot: options.sysroot ?? "",
        clangFlags: options.clangFlags ?? [],
      }),
    );
  }

  private normalizeJobs(jobs: number | undefined): number {
    if (!Number.isInteger(jobs) || jobs === undefined || jobs <= 0) {
      return 1;
    }
    return jobs;
  }

  resetStats(jobs: number | undefined = 1): void {
    this.lastStats = {
      totalModules: 0,
      cacheSize: 0,
      hits: 0,
      misses: 0,
      compiled: 0,
      reused: 0,
      jobs: this.normalizeJobs(jobs),
    };
  }

  private getCachedModuleObject(
    modulePath: string,
    hash: string,
  ): string | undefined {
    const cached = this.manifest.modules.get(modulePath);
    if (cached && cached.hash === hash && fs.existsSync(cached.objectFile)) {
      return cached.objectFile;
    }
    return undefined;
  }

  /**
   * Check if a module is cached and up-to-date
   */
  isCached(
    modulePath: string,
    content: string,
    target?: string,
    optimizationLevel?: number,
    options: { sysroot?: string; clangFlags?: string[] } = {},
  ): boolean {
    const hash = this.getModuleHash(
      content,
      target,
      optimizationLevel,
      options,
    );
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
    optimizationLevel?: number,
    options: { sysroot?: string; clangFlags?: string[] } = {},
  ): string {
    // Include codegen-affecting options so incompatible object files do not collide.
    const hash = this.getModuleHash(content, target, optimizationLevel, options);
    const objectFileName = `${hash}.o`;
    const objectFilePath = path.join(this.cacheDir, objectFileName);
    const tempSuffix = `${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const tempObjectFilePath = path.join(
      this.cacheDir,
      `${hash}.${tempSuffix}.o`,
    );

    // Check if already cached
    // We use the modified hash, so isCached needs to know about it or we check manually
    // Since isCached calls calculateHash(content), we can't use it directly if we change hashing logic
    // Let's check manually here using our new hash
    const cachedObjectFile = this.getCachedModuleObject(modulePath, hash);
    if (cachedObjectFile) {
      this.lastStats.hits++;
      this.lastStats.reused++;
      if (verbose) {
        compilerLog.info(`Using cached: ${path.basename(modulePath)}`);
      }
      return cachedObjectFile;
    }

    this.lastStats.misses++;
    this.lastStats.compiled++;

    if (verbose) {
      compilerLog.info(`Compiling: ${path.basename(modulePath)}`);
    }

    // Write LLVM IR to temporary file
    const llFilePath = path.join(this.cacheDir, `${hash}.ll`);
    fs.writeFileSync(llFilePath, llvmIR);

    // Compile to object file using the selected LLVM-capable compiler driver.
    const clangArgs = ["-c", "-Wno-override-module"];
    if (target) {
      clangArgs.push("-target", target);
    }
    if (options.sysroot) {
      clangArgs.push("--sysroot", options.sysroot);
    }
    if (optimizationLevel !== undefined) {
      clangArgs.push(`-O${optimizationLevel}`);
    }
    clangArgs.push(...(options.clangFlags ?? []));
    clangArgs.push(llFilePath, "-o", tempObjectFilePath);

    const compilerCommand = getCompilerDriver(target);
    let compiled = false;

    try {
      const result = spawnSync(compilerCommand, clangArgs, {
        stdio: verbose ? "inherit" : "pipe",
      });

      if (result.status !== 0) {
        const error =
          result.stderr?.toString() ||
          result.error?.message ||
          "Unknown compilation error";
        throw new CompilerError(
          `Failed to compile ${modulePath} with ${compilerCommand}: ${error}`,
          "Check compiler driver output for details.",
          {
            file: modulePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }
      fs.renameSync(tempObjectFilePath, objectFilePath);
      compiled = true;
    } finally {
      this.removeCacheTempFile(llFilePath);
      if (!compiled) {
        this.removeCacheTempFile(tempObjectFilePath);
      }
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
   * Compile multiple modules to object files with a bounded async worker pool.
   *
   * This is the backend primitive for parallel module compilation. It preserves
   * input order in the returned object list while allowing independent clang
   * invocations to overlap.
   */
  async compileModules(
    modules: ModuleCompileInput[],
    options: ModuleCompileBatchOptions = {},
  ): Promise<string[]> {
    const jobs = Math.min(
      this.normalizeJobs(options.jobs),
      modules.length || 1,
    );
    this.resetStats(jobs);
    const results = new Array<string>(modules.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < modules.length) {
        const index = nextIndex++;
        const input = modules[index]!;
        results[index] = await this.compileModuleAsync(input, options);
      }
    };

    await Promise.all(Array.from({ length: jobs }, () => worker()));
    return results;
  }

  private async compileModuleAsync(
    input: ModuleCompileInput,
    options: ModuleCompileBatchOptions,
  ): Promise<string> {
    const target = input.target ?? options.target;
    const sysroot = input.sysroot ?? options.sysroot;
    const clangFlags = input.clangFlags ?? options.clangFlags;
    const optimizationLevel =
      input.optimizationLevel ?? options.optimizationLevel;
    const hash = this.getModuleHash(input.content, target, optimizationLevel, {
      sysroot,
      clangFlags,
    });
    const objectFilePath = path.join(this.cacheDir, `${hash}.o`);
    const tempSuffix = `${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;
    const tempObjectFilePath = path.join(
      this.cacheDir,
      `${hash}.${tempSuffix}.o`,
    );
    const cachedObjectFile = this.getCachedModuleObject(input.modulePath, hash);

    if (cachedObjectFile) {
      this.lastStats.hits++;
      this.lastStats.reused++;
      if (options.verbose) {
        compilerLog.info(`Using cached: ${path.basename(input.modulePath)}`);
      }
      return cachedObjectFile;
    }

    this.lastStats.misses++;
    this.lastStats.compiled++;

    if (options.verbose) {
      compilerLog.info(`Compiling: ${path.basename(input.modulePath)}`);
    }

    const llFilePath = path.join(this.cacheDir, `${hash}.${tempSuffix}.ll`);
    fs.writeFileSync(llFilePath, input.llvmIR);

    const clangArgs = ["-c", "-Wno-override-module"];
    if (target) {
      clangArgs.push("-target", target);
    }
    if (sysroot) {
      clangArgs.push("--sysroot", sysroot);
    }
    if (optimizationLevel !== undefined) {
      clangArgs.push(`-O${optimizationLevel}`);
    }
    clangArgs.push(...(clangFlags ?? []));
    clangArgs.push(llFilePath, "-o", tempObjectFilePath);

    let compiled = false;
    try {
      await this.runCompilerDriver(
        clangArgs,
        input.modulePath,
        target,
        options.verbose,
      );

      fs.renameSync(tempObjectFilePath, objectFilePath);
      compiled = true;
    } finally {
      this.removeCacheTempFile(llFilePath);
      if (!compiled) {
        this.removeCacheTempFile(tempObjectFilePath);
      }
    }

    this.manifest.modules.set(input.modulePath, {
      path: input.modulePath,
      hash,
      objectFile: objectFilePath,
      timestamp: Date.now(),
    });
    this.saveManifest();

    return objectFilePath;
  }

  private removeCacheTempFile(filePath: string): void {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private runCompilerDriver(
    args: string[],
    modulePath: string,
    target?: string,
    verbose: boolean = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const compilerCommand = getCompilerDriver(target);
      const child = spawn(compilerCommand, args, {
        stdio: verbose ? "inherit" : "pipe",
      });

      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(
          new CompilerError(
            `Failed to compile ${modulePath} with ${compilerCommand}: ${error.message}`,
            "Check compiler driver output for details.",
            {
              file: modulePath,
              startLine: 0,
              startColumn: 0,
              endLine: 0,
              endColumn: 0,
            },
          ),
        );
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new CompilerError(
            `Failed to compile ${modulePath} with ${compilerCommand}: ${stderr || "Unknown compilation error"}`,
            "Check compiler driver output for details.",
            {
              file: modulePath,
              startLine: 0,
              startColumn: 0,
              endLine: 0,
              endColumn: 0,
            },
          ),
        );
      });
    });
  }

  /**
   * Link object files into executable
   */
  linkModules(
    objectFiles: string[],
    outputPath: string,
    verbose: boolean = false,
    target?: string,
    options: ModuleLinkOptions = {},
  ): void {
    this.assertWritableLinkOutputPath(outputPath);

    if (verbose) {
      compilerLog.info(`Linking ${objectFiles.length} modules...`);
    }

    const clangArgs = [
      ...objectFiles,
      ...(options.objectFiles ?? []),
      ...(options.libraryPaths ?? []).flatMap((libraryPath) => [
        "-L",
        libraryPath,
      ]),
      ...(options.libraries ?? []).map((library) => `-l${library}`),
      ...(isWasmTarget(target) ? [] : getNativeLinkerFlags()),
      ...(options.clangFlags ?? []),
      "-o",
      outputPath,
    ];
    if (target) {
      clangArgs.unshift("-target", target);
    }
    if (options.sysroot) {
      clangArgs.unshift(`--sysroot=${options.sysroot}`);
    }

    const compilerCommand = getCompilerDriver(target);
    const result = spawnSync(compilerCommand, clangArgs, {
      stdio: verbose ? "inherit" : "pipe",
    });

    if (result.status !== 0) {
      const error =
        result.stderr?.toString() ||
        result.error?.message ||
        "Unknown linking error";
      throw new CompilerError(
        `Failed to link modules with ${compilerCommand}: ${error}`,
        "Check compiler driver output for details.",
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

  private assertWritableLinkOutputPath(outputPath: string): void {
    const location = {
      file: outputPath,
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    };

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
      throw new CompilerError(
        `Output path is a directory: ${outputPath}`,
        "Choose a file path for the linked executable.",
        location,
      );
    }

    const outputDir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(outputDir)) {
      throw new CompilerError(
        `Output directory not found: ${outputDir}`,
        "Create the output directory or choose an existing parent directory.",
        location,
      );
    }
    if (!fs.statSync(outputDir).isDirectory()) {
      throw new CompilerError(
        `Output parent path is not a directory: ${outputDir}`,
        "Choose an output path whose parent is a directory.",
        location,
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
  getStats(): ModuleCacheStats {
    let totalSize = 0;
    for (const cached of this.manifest.modules.values()) {
      if (fs.existsSync(cached.objectFile)) {
        const stats = fs.statSync(cached.objectFile);
        totalSize += stats.size;
      }
    }
    return {
      ...this.lastStats,
      totalModules: this.manifest.modules.size,
      cacheSize: totalSize,
    };
  }
}

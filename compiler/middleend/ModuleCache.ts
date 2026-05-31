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

import {
  getCompilerDriver,
  getCompilerDriverTimeoutMs,
  isWasmTarget,
} from "../common/CompilerDriver";
import { CompilerError } from "../common/CompilerError";
import { compilerLog } from "../common/Logger";
import { getNativeLinkerFlags } from "../common/NativeLinkerFlags";
import { formatSpawnFailureReason } from "../common/ProcessErrors";

export const MODULE_CACHE_VERSION = "2.0.0";

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
    const cacheStat = this.tryLstat(this.cacheDir);
    if (cacheStat?.isSymbolicLink()) {
      throw new CompilerError(
        `Module cache path is a symbolic link: ${this.cacheDir}`,
        "Remove the symlink or configure a project directory where .bpl-cache can be a real directory.",
        {
          file: this.cacheDir,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }
    if (cacheStat && !cacheStat.isDirectory()) {
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

    this.assertNoSymlinkedCacheParent(this.cacheDir, this.cacheDir);

    if (!cacheStat) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Load cache manifest
   */
  private loadManifest(): CacheManifest {
    const manifestStat = this.tryLstat(this.manifestPath);
    if (manifestStat) {
      if (manifestStat.isSymbolicLink()) {
        throw new CompilerError(
          `Module cache manifest path is a symbolic link: ${this.manifestPath}`,
          "Remove the symlink so the compiler can recreate the cache manifest.",
          {
            file: this.manifestPath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }
      if (!manifestStat.isFile()) {
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
        const manifest = this.parseManifest(parsed);
        if (manifest?.version === MODULE_CACHE_VERSION) {
          return manifest;
        }
        compilerLog.warn(
          "Invalid cache manifest schema or version, creating new one",
        );
      } catch {
        compilerLog.warn("Failed to load cache manifest, creating new one");
      }
    }
    return {
      version: MODULE_CACHE_VERSION,
      modules: new Map(),
    };
  }

  private parseManifest(parsed: unknown): CacheManifest | null {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as { version?: unknown; modules?: unknown };
    const version =
      typeof record.version === "string" && record.version.length > 0
        ? record.version
        : "1.0.0";
    const rawModules = record.modules ?? {};
    if (
      !rawModules ||
      typeof rawModules !== "object" ||
      Array.isArray(rawModules)
    ) {
      return null;
    }

    const modules = new Map<string, CachedModule>();
    for (const [modulePath, value] of Object.entries(rawModules)) {
      if (!this.isCachedModule(value)) {
        return null;
      }
      if (value.path !== modulePath) {
        return null;
      }
      modules.set(modulePath, value);
    }

    return { version, modules };
  }

  private isCachedModule(value: unknown): value is CachedModule {
    return (
      Boolean(value) &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as CachedModule).path === "string" &&
      typeof (value as CachedModule).hash === "string" &&
      typeof (value as CachedModule).objectFile === "string" &&
      typeof (value as CachedModule).timestamp === "number" &&
      Number.isFinite((value as CachedModule).timestamp)
    );
  }

  /**
   * Save cache manifest
   */
  private saveManifest(): void {
    const data = {
      version: this.manifest.version,
      modules: Object.fromEntries(this.manifest.modules),
    };
    this.assertWritableCacheManifestPath();

    for (let attempt = 0; attempt < 10; attempt++) {
      const tempManifestPath = this.getManifestTempPath(attempt);
      let createdTemp = false;

      try {
        fs.writeFileSync(tempManifestPath, JSON.stringify(data, null, 2), {
          flag: "wx",
        });
        createdTemp = true;
        fs.renameSync(tempManifestPath, this.manifestPath);
        return;
      } catch (error) {
        if (this.isNodeErrorCode(error, "EEXIST")) {
          continue;
        }
        this.removeCacheTempFile(tempManifestPath);
        throw error;
      } finally {
        if (createdTemp) {
          this.removeCacheTempFile(tempManifestPath);
        }
      }
    }

    throw new CompilerError(
      `Failed to create module cache manifest temp file: ${this.manifestPath}`,
      "Remove stale temporary files from .bpl-cache or run 'bpl clean'.",
      {
        file: this.manifestPath,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
    );
  }

  private getManifestTempPath(attempt: number): string {
    const tempSuffix = `${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}-${attempt}`;
    return path.join(this.cacheDir, `manifest.${tempSuffix}.json.tmp`);
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
        cacheVersion: MODULE_CACHE_VERSION,
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
    if (
      cached &&
      cached.hash === hash &&
      this.isUsableCacheFile(cached.objectFile)
    ) {
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
    if (!this.isUsableCacheFile(cached.objectFile)) {
      return false;
    }

    return true;
  }

  /**
   * Get cached object file path
   */
  getCachedObjectFile(modulePath: string): string | null {
    const cached = this.manifest.modules.get(modulePath);
    if (cached && this.isUsableCacheFile(cached.objectFile)) {
      return cached.objectFile;
    }
    return null;
  }

  /**
   * Compile module to object file
   */
  // eslint-disable-next-line max-params -- Keep the existing cache API stable for callers.
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
    this.assertWritableCacheFilePath(
      objectFilePath,
      modulePath,
      "Module cache object path",
    );
    this.assertWritableCacheFilePath(
      tempObjectFilePath,
      modulePath,
      "Module cache temporary object path",
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

    const llFilePath = path.join(this.cacheDir, `${hash}.${tempSuffix}.ll`);
    this.assertWritableCacheFilePath(
      llFilePath,
      modulePath,
      "Module cache IR path",
    );
    let compiled = false;

    try {
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
      const result = spawnSync(compilerCommand, clangArgs, {
        stdio: verbose ? "inherit" : "pipe",
        timeout: getCompilerDriverTimeoutMs(),
      });

      if (result.status !== 0) {
        const error = this.formatCompilerDriverFailure(
          result.stderr?.toString(),
          result.error,
          "Unknown compilation error",
        );
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
      this.assertCompilerCreatedObjectFile(tempObjectFilePath, modulePath);
      this.finalizeCachedObjectFile(
        tempObjectFilePath,
        objectFilePath,
        modulePath,
      );
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
    this.assertWritableCacheFilePath(
      objectFilePath,
      input.modulePath,
      "Module cache object path",
    );
    this.assertWritableCacheFilePath(
      tempObjectFilePath,
      input.modulePath,
      "Module cache temporary object path",
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
    this.assertWritableCacheFilePath(
      llFilePath,
      input.modulePath,
      "Module cache IR path",
    );
    let compiled = false;
    try {
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

      await this.runCompilerDriver(
        clangArgs,
        input.modulePath,
        target,
        options.verbose,
      );

      this.assertCompilerCreatedObjectFile(
        tempObjectFilePath,
        input.modulePath,
      );
      this.finalizeCachedObjectFile(
        tempObjectFilePath,
        objectFilePath,
        input.modulePath,
      );
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
      if (this.findSymlinkedParentPath(filePath)) return;
      fs.rmSync(filePath, { force: true, recursive: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private assertCompilerCreatedObjectFile(
    tempObjectFilePath: string,
    modulePath: string,
  ): void {
    const tempObjectStats = this.tryLstat(tempObjectFilePath);
    if (tempObjectStats?.isFile()) {
      return;
    }

    this.removeCacheTempFile(tempObjectFilePath);
    throw new CompilerError(
      `Compiler driver did not create module object for ${modulePath}: ${tempObjectFilePath}`,
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

  private finalizeCachedObjectFile(
    tempObjectFilePath: string,
    objectFilePath: string,
    modulePath: string,
  ): void {
    const existingObject = this.tryLstat(objectFilePath);
    if (existingObject?.isFile()) {
      this.removeCacheTempFile(tempObjectFilePath);
      return;
    }

    this.assertWritableCacheFilePath(
      objectFilePath,
      modulePath,
      "Module cache object path",
    );

    try {
      fs.renameSync(tempObjectFilePath, objectFilePath);
    } catch (error) {
      this.removeCacheTempFile(tempObjectFilePath);
      throw new CompilerError(
        `Failed to finalize cached module object for ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
        "Remove the malformed cache path or run 'bpl clean' before rebuilding.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }
  }

  private isUsableCacheFile(filePath: string): boolean {
    return this.getUsableCacheFileStats(filePath) !== null;
  }

  private getUsableCacheFileStats(filePath: string): fs.Stats | null {
    try {
      if (!this.isPathInsideCacheDir(filePath)) {
        return null;
      }

      if (this.findSymlinkedParentPath(filePath)) {
        return null;
      }

      const stats = fs.lstatSync(filePath);
      return stats.isFile() ? stats : null;
    } catch {
      return null;
    }
  }

  private isPathInsideCacheDir(filePath: string): boolean {
    const cacheRoot = path.resolve(this.cacheDir);
    const resolvedPath = path.resolve(filePath);
    return (
      resolvedPath.length > cacheRoot.length &&
      resolvedPath.startsWith(`${cacheRoot}${path.sep}`)
    );
  }

  private assertWritableCacheFilePath(
    filePath: string,
    modulePath: string,
    label: string,
  ): void {
    const existing = this.tryLstat(filePath);
    if (existing?.isSymbolicLink()) {
      throw new CompilerError(
        `${label} is a symbolic link: ${filePath}`,
        "Remove the malformed cache path or run 'bpl clean' before rebuilding.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    if (existing && !existing.isFile()) {
      throw new CompilerError(
        `${label} is not a file: ${filePath}`,
        "Remove the malformed cache path or run 'bpl clean' before rebuilding.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    const outputDir = path.dirname(path.resolve(filePath));
    const outputDirStat = this.tryLstat(outputDir);
    if (outputDirStat?.isSymbolicLink()) {
      throw new CompilerError(
        `Module cache directory is a symbolic link: ${outputDir}`,
        "Remove the symlink or run 'bpl clean' before rebuilding.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    if (!outputDirStat?.isDirectory()) {
      throw new CompilerError(
        `Module cache directory is not writable: ${outputDir}`,
        "Remove the malformed cache path or run 'bpl clean' before rebuilding.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    this.assertNoSymlinkedCacheParent(filePath, modulePath);
  }

  private assertWritableCacheManifestPath(): void {
    const existing = this.tryLstat(this.manifestPath);
    if (existing?.isSymbolicLink()) {
      throw new CompilerError(
        `Module cache manifest path is a symbolic link: ${this.manifestPath}`,
        "Remove the symlink so the compiler can recreate the cache manifest.",
        {
          file: this.manifestPath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }
    if (existing && !existing.isFile()) {
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

    const outputDir = path.dirname(path.resolve(this.manifestPath));
    const outputDirStat = this.tryLstat(outputDir);
    if (outputDirStat?.isSymbolicLink()) {
      throw new CompilerError(
        `Module cache directory is a symbolic link: ${outputDir}`,
        "Remove the symlink so the compiler can recreate the cache manifest.",
        {
          file: outputDir,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    if (!outputDirStat?.isDirectory()) {
      throw new CompilerError(
        `Module cache directory is not writable: ${outputDir}`,
        "Remove the malformed cache path or run 'bpl clean' before rebuilding.",
        {
          file: outputDir,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    this.assertNoSymlinkedCacheParent(this.manifestPath, this.manifestPath);
  }

  private assertNoSymlinkedCacheParent(
    filePath: string,
    diagnosticFile: string,
  ): void {
    const symlinkedParent = this.findSymlinkedParentPath(filePath);
    if (!symlinkedParent) return;

    throw new CompilerError(
      `Module cache parent path is a symbolic link: ${symlinkedParent}`,
      "Remove the symlink or run the build from a real project path.",
      {
        file: diagnosticFile,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
    );
  }

  private findSymlinkedParentPath(filePath: string): string | undefined {
    const absolutePath = path.resolve(filePath);
    const rootPath = path.parse(absolutePath).root;
    const parts = path
      .relative(rootPath, path.dirname(absolutePath))
      .split(path.sep)
      .filter((part) => part.length > 0);

    let currentPath = rootPath;
    for (const part of parts) {
      currentPath = path.join(currentPath, part);
      const stats = this.tryLstat(currentPath);
      if (stats?.isSymbolicLink()) return currentPath;
      if (stats && !stats.isDirectory()) return undefined;
    }

    return undefined;
  }

  private tryLstat(filePath: string): fs.Stats | undefined {
    try {
      return fs.lstatSync(filePath);
    } catch (error) {
      if (
        this.isNodeErrorCode(error, "ENOENT") ||
        this.isNodeErrorCode(error, "ENOTDIR")
      ) {
        return undefined;
      }
      throw error;
    }
  }

  private isNodeErrorCode(error: unknown, code: string): boolean {
    return (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === code
    );
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
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(
          new CompilerError(
            `Failed to compile ${modulePath} with ${compilerCommand}: timed out`,
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
      }, getCompilerDriverTimeoutMs());

      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        action();
      };

      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        finish(() =>
          reject(
            new CompilerError(
              `Failed to compile ${modulePath} with ${compilerCommand}: ${this.formatSpawnFailure(error)}`,
              "Check compiler driver output for details.",
              {
                file: modulePath,
                startLine: 0,
                startColumn: 0,
                endLine: 0,
                endColumn: 0,
              },
            ),
          ),
        );
      });

      child.on("close", (code) => {
        if (code === 0) {
          finish(() => resolve());
          return;
        }

        finish(() =>
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
    const tempOutputPath = this.createTemporaryLinkOutputPath(outputPath);

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
      tempOutputPath,
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
      timeout: getCompilerDriverTimeoutMs(),
    });

    if (result.status !== 0) {
      const error = this.formatCompilerDriverFailure(
        result.stderr?.toString(),
        result.error,
        "Unknown linking error",
      );
      this.removeCacheTempFile(tempOutputPath);
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

    const tempOutputStats = this.tryLstat(tempOutputPath);
    if (!tempOutputStats?.isFile()) {
      this.removeCacheTempFile(tempOutputPath);
      throw new CompilerError(
        `Compiler driver did not create linked output: ${outputPath}`,
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

    try {
      this.assertWritableLinkOutputPath(tempOutputPath);
      this.assertWritableLinkOutputPath(outputPath);
      fs.renameSync(tempOutputPath, outputPath);
    } catch (error) {
      this.removeCacheTempFile(tempOutputPath);
      throw new CompilerError(
        `Failed to finalize linked output ${outputPath}: ${error instanceof Error ? error.message : String(error)}`,
        "Check output path permissions and retry.",
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

  private createTemporaryLinkOutputPath(outputPath: string): string {
    for (let attempt = 0; attempt < 10; attempt++) {
      const tempPath = path.join(
        path.dirname(path.resolve(outputPath)),
        `.${path.basename(outputPath)}.${process.pid}-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}-${attempt}.tmp`,
      );
      if (this.tryLstat(tempPath)) {
        continue;
      }
      this.assertWritableLinkOutputPath(tempPath);
      return tempPath;
    }

    throw new CompilerError(
      `Failed to create temporary linked output for ${outputPath}`,
      "Remove stale temporary linker outputs from the output directory and retry.",
      {
        file: outputPath,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
    );
  }

  private assertWritableLinkOutputPath(outputPath: string): void {
    const location = {
      file: outputPath,
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    };

    const existingOutput = this.tryLstat(outputPath);
    if (existingOutput?.isSymbolicLink()) {
      throw new CompilerError(
        `Output path is a symbolic link: ${outputPath}`,
        "Choose a regular file path for the linked executable.",
        location,
      );
    }

    if (existingOutput?.isDirectory()) {
      throw new CompilerError(
        `Output path is a directory: ${outputPath}`,
        "Choose a file path for the linked executable.",
        location,
      );
    }

    if (existingOutput && !existingOutput.isFile()) {
      throw new CompilerError(
        `Output path is not a regular file: ${outputPath}`,
        "Choose a regular file path for the linked executable.",
        location,
      );
    }

    const outputDir = path.dirname(path.resolve(outputPath));
    const outputDirStats = this.tryLstat(outputDir);
    if (!outputDirStats) {
      throw new CompilerError(
        `Output directory not found: ${outputDir}`,
        "Create the output directory or choose an existing parent directory.",
        location,
      );
    }
    if (outputDirStats.isSymbolicLink()) {
      throw new CompilerError(
        `Output parent path is a symbolic link: ${outputDir}`,
        "Choose an output path whose parent is a real directory.",
        location,
      );
    }
    if (!outputDirStats.isDirectory()) {
      throw new CompilerError(
        `Output parent path is not a directory: ${outputDir}`,
        "Choose an output path whose parent is a directory.",
        location,
      );
    }

    const symlinkedParent = this.findSymlinkedParentPath(outputPath);
    if (symlinkedParent) {
      throw new CompilerError(
        `Output parent path contains a symbolic link: ${symlinkedParent}`,
        "Choose an output path whose parent components are real directories.",
        location,
      );
    }
  }

  private formatCompilerDriverFailure(
    stderr: string | undefined,
    error: Error | undefined,
    fallback: string,
  ): string {
    return stderr || this.formatSpawnFailure(error) || fallback;
  }

  private formatSpawnFailure(error: Error | undefined): string | undefined {
    return formatSpawnFailureReason(error);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    const cacheStat = this.tryLstat(this.cacheDir);
    if (cacheStat?.isSymbolicLink()) {
      throw new CompilerError(
        `Module cache path is a symbolic link: ${this.cacheDir}`,
        "Remove the symlink or configure a project directory where .bpl-cache can be a real directory.",
        {
          file: this.cacheDir,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }
    if (cacheStat && !cacheStat.isDirectory()) {
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

    this.assertNoSymlinkedCacheParent(this.cacheDir, this.cacheDir);

    if (cacheStat) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    }
    this.ensureCacheDir();
    this.manifest = {
      version: MODULE_CACHE_VERSION,
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
      const stats = this.getUsableCacheFileStats(cached.objectFile);
      if (stats) {
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

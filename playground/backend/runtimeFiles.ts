import { execFile } from "child_process";
import { mkdirSync, renameSync, statSync, unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";
import { promisify } from "util";

import { getBplHome } from "../../compiler/common/PathResolver";

const execFileAsync = promisify(execFile);

type RuntimeObjectCacheEntry = Promise<string | undefined>;

const runtimeObjectCache = new Map<string, RuntimeObjectCacheEntry>();

export interface PlaygroundRuntimeFileOptions {
  bplHome?: string;
  cacheDir?: string;
  compiler?: string;
  warn?: (message: string) => void;
}

function runtimeObjectCacheKey(
  runtimeLLPath: string,
  cacheDir: string,
  compiler: string,
): { key: string; objectPath: string } {
  const stats = statSync(runtimeLLPath);
  const fingerprint = `${stats.size}-${Math.floor(stats.mtimeMs)}`;
  const objectName = `${basename(runtimeLLPath, ".ll")}-${fingerprint}.o`;
  const objectPath = join(cacheDir, objectName);

  return {
    key: [runtimeLLPath, objectPath, compiler].join("\0"),
    objectPath,
  };
}

async function compileRuntimeObject(
  runtimeLLPath: string,
  objectPath: string,
  compiler: string,
): Promise<string> {
  if (existsSync(objectPath)) {
    return objectPath;
  }

  mkdirSync(dirname(objectPath), { recursive: true });
  const tempObjectPath = `${objectPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await execFileAsync(compiler, [
      "-c",
      runtimeLLPath,
      "-Wno-override-module",
      "-o",
      tempObjectPath,
    ]);
    renameSync(tempObjectPath, objectPath);
  } catch (error) {
    try {
      unlinkSync(tempObjectPath);
    } catch {
      // Best-effort cleanup after compiler failure.
    }
    throw error;
  }

  return objectPath;
}

async function getCachedRuntimeObject(
  runtimeLLPath: string,
  options: Required<
    Pick<PlaygroundRuntimeFileOptions, "cacheDir" | "compiler">
  > &
    Pick<PlaygroundRuntimeFileOptions, "warn">,
): Promise<string | undefined> {
  const { key, objectPath } = runtimeObjectCacheKey(
    runtimeLLPath,
    options.cacheDir,
    options.compiler,
  );

  let entry = runtimeObjectCache.get(key);
  if (!entry) {
    entry = compileRuntimeObject(
      runtimeLLPath,
      objectPath,
      options.compiler,
    ).catch((error) => {
      const stderr = (error as { stderr?: string }).stderr;
      const message = stderr || (error as Error).message || String(error);
      options.warn?.(
        `Falling back to runtime.ll because cached runtime object compilation failed: ${message}`,
      );
      return undefined;
    });
    runtimeObjectCache.set(key, entry);
  }

  return await entry;
}

export async function resolvePlaygroundNativeRuntimeFiles(
  options: PlaygroundRuntimeFileOptions = {},
): Promise<string[]> {
  const bplHome = options.bplHome ?? getBplHome();
  const cacheDir =
    options.cacheDir ?? join(tmpdir(), "bpl-playground-runtime-cache");
  const compiler = options.compiler ?? process.env.CC ?? "clang";
  const runtimeFiles: string[] = [];

  const runtimeLLPath = join(bplHome, "lib", "runtime.ll");
  if (existsSync(runtimeLLPath)) {
    const runtimeObjectPath = await getCachedRuntimeObject(runtimeLLPath, {
      cacheDir,
      compiler,
      warn: options.warn,
    });
    runtimeFiles.push(runtimeObjectPath ?? runtimeLLPath);
  }

  const runtimeSupportPath = join(bplHome, "lib", "runtime_support.o");
  if (existsSync(runtimeSupportPath)) {
    runtimeFiles.push(runtimeSupportPath);
  }

  return runtimeFiles;
}

export function resetPlaygroundNativeRuntimeFileCacheForTests(): void {
  runtimeObjectCache.clear();
}

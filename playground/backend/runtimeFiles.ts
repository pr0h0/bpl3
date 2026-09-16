import { existsSync } from "fs";
import { join } from "path";

import { getBplHome } from "../../compiler/common/PathResolver";

const runtimeObjectCache = new Map<string, Promise<string | undefined>>();

export interface PlaygroundRuntimeFileOptions {
  bplHome?: string;
  cacheDir?: string;
  compiler?: string;
  target?: string;
  warn?: (message: string) => void;
}

export async function resolvePlaygroundNativeRuntimeFiles(
  options: PlaygroundRuntimeFileOptions = {},
): Promise<string[]> {
  const bplHome = options.bplHome ?? getBplHome();
  const runtimeFiles: string[] = [];

  const runtimeSupportPath = join(bplHome, "lib", "runtime_support.o");
  if (existsSync(runtimeSupportPath)) {
    runtimeFiles.push(runtimeSupportPath);
  }

  return runtimeFiles;
}

export function resetPlaygroundNativeRuntimeFileCacheForTests(): void {
  runtimeObjectCache.clear();
}

import { existsSync, lstatSync, readFileSync, statSync } from "fs";
import { join } from "path";

import { getBplHome } from "../compiler/common/PathResolver";
import { findSymlinkedParentPath } from "../compiler/common/PathSafety";

const runtimeObjectCache = new Map<string, string | undefined>();
const BPL_NATIVE_RUNTIME_SYMBOL_PATTERN =
  /@(?:__bpl_[A-Za-z0-9_]+|defer_top|exception_top|exception_value|exception_type)\b/;

export interface NativeRuntimeFileOptions {
  /** When given, the runtime links only if this IR references its symbols. */
  irPath?: string;
  bplHome?: string;
}

export function resolveNativeRuntimeFiles(
  options: NativeRuntimeFileOptions = {},
): string[] {
  if (
    options.irPath !== undefined &&
    !nativeIrNeedsBplRuntime(options.irPath)
  ) {
    return [];
  }

  const bplHome = options.bplHome ?? getBplHome();
  const runtimeSupportPath = join(bplHome, "lib", "runtime_support.o");
  assertReadableRuntimeInput(runtimeSupportPath, "Runtime support object");
  return [runtimeSupportPath];
}

export function nativeIrNeedsBplRuntime(irPath: string): boolean {
  return BPL_NATIVE_RUNTIME_SYMBOL_PATTERN.test(readFileSync(irPath, "utf8"));
}

export function resetNativeRuntimeFileCacheForTests(): void {
  runtimeObjectCache.clear();
}

function assertReadableRuntimeInput(filePath: string, label: string): void {
  let linkStats;
  try {
    linkStats = lstatSync(filePath, { throwIfNoEntry: false });
  } catch {
    linkStats = undefined;
  }

  if (!linkStats) {
    throw new Error(
      `${label} not found: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  if (linkStats.isSymbolicLink() && !existsSync(filePath)) {
    throw new Error(
      `${label} is a broken symbolic link: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  const symlinkedParent = findSymlinkedParentPath(filePath);
  if (symlinkedParent) {
    throw new Error(
      `${label} parent path contains a symbolic link: ${symlinkedParent}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  if (!linkStats.isFile()) {
    const stats = statSync(filePath);
    if (stats.isFile()) {
      return;
    }
    throw new Error(
      `${label} is not a file: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }
}

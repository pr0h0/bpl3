/**
 * Whether generated IR needs the native runtime object, and where it lives.
 * Programs that trigger no runtime check, such as a hello world, link nothing.
 */
import { spawnSync } from "child_process";
import { existsSync, renameSync, rmSync } from "fs";
import { join } from "path";

import {
  getCompilerDriver,
  getCompilerDriverTimeoutMs,
} from "./CompilerDriver";
import { isEmbeddedHome } from "./EmbeddedHome";
import { getBplHome } from "./PathResolver";

const NATIVE_RUNTIME_SYMBOL_PATTERN =
  /@(?:__bpl_[A-Za-z0-9_]+|defer_top|exception_top|exception_value|exception_type)\b/;

export function irNeedsNativeRuntime(llvmIr: string): boolean {
  return NATIVE_RUNTIME_SYMBOL_PATTERN.test(llvmIr);
}

/** The runtime object to link, built first in an unpacked installation. */
export function getNativeRuntimeSupportObjectPath(bplHome?: string): string {
  const home = bplHome ?? getBplHome();
  ensureEmbeddedRuntimeObject(home);
  return join(home, "lib", "runtime_support.o");
}

/**
 * Build `lib/runtime_support.o` in an unpacked installation from the bundled
 * C source, with the flags `lib/build_runtime.sh` uses for a release build.
 * Other installations are left alone; a missing object there is reported by
 * the caller.
 */
export function ensureEmbeddedRuntimeObject(bplHome: string): void {
  const object = join(bplHome, "lib", "runtime_support.o");
  if (existsSync(object) || !isEmbeddedHome(bplHome)) return;

  const driver = getCompilerDriver();
  const staging = `${object}.${process.pid}.tmp.o`;
  const result = spawnSync(
    driver,
    [
      "-c",
      "-fPIC",
      "-O2",
      "-g",
      "-ffunction-sections",
      "-fdata-sections",
      join(bplHome, "lib", "runtime_support.c"),
      "-o",
      staging,
    ],
    { encoding: "utf8", timeout: getCompilerDriverTimeoutMs() },
  );
  if (result.status !== 0) {
    rmSync(staging, { force: true });
    const detail = (result.stderr || result.error?.message || "").trim();
    throw new Error(
      `Could not build the BPL runtime support object with '${driver}'${detail ? `: ${detail}` : "."} Install clang or set BPL_CC/CC.`,
    );
  }
  renameSync(staging, object);
}

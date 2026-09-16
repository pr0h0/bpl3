/**
 * Whether generated IR needs the native runtime object, and where it lives.
 * Programs that trigger no runtime check, such as a hello world, link nothing.
 */
import { join } from "path";

import { getBplHome } from "./PathResolver";

const NATIVE_RUNTIME_SYMBOL_PATTERN =
  /@(?:__bpl_[A-Za-z0-9_]+|defer_top|exception_top|exception_value|exception_type)\b/;

export function irNeedsNativeRuntime(llvmIr: string): boolean {
  return NATIVE_RUNTIME_SYMBOL_PATTERN.test(llvmIr);
}

export function getNativeRuntimeSupportObjectPath(bplHome?: string): string {
  return join(bplHome ?? getBplHome(), "lib", "runtime_support.o");
}

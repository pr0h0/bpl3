import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  resetPlaygroundNativeRuntimeFileCacheForTests,
  resolvePlaygroundNativeRuntimeFiles,
} from "../playground/backend/runtimeFiles";

function createRuntimeHome(withSupportObject = true): string {
  const root = mkdtempSync(join(tmpdir(), "bpl-playground-runtime-home-"));
  const libDir = join(root, "lib");
  writeFileSync(join(root, ".keep"), "");
  mkdirSync(libDir, { recursive: true });
  if (withSupportObject) {
    writeFileSync(
      join(libDir, "runtime_support.o"),
      "runtime support object\n",
    );
  }
  return root;
}

describe("Playground native runtime file resolution", () => {
  // The runtime is a single prebuilt C object; there is no runtime IR to
  // precompile or cache any more.
  test("links the runtime support object when it exists", async () => {
    resetPlaygroundNativeRuntimeFileCacheForTests();
    const bplHome = createRuntimeHome();

    try {
      const files = await resolvePlaygroundNativeRuntimeFiles({ bplHome });
      expect(files).toEqual([join(bplHome, "lib", "runtime_support.o")]);
    } finally {
      rmSync(bplHome, { recursive: true, force: true });
      resetPlaygroundNativeRuntimeFileCacheForTests();
    }
  });

  test("returns no runtime files when the support object is missing", async () => {
    resetPlaygroundNativeRuntimeFileCacheForTests();
    const bplHome = createRuntimeHome(false);

    try {
      expect(await resolvePlaygroundNativeRuntimeFiles({ bplHome })).toEqual(
        [],
      );
    } finally {
      rmSync(bplHome, { recursive: true, force: true });
      resetPlaygroundNativeRuntimeFileCacheForTests();
    }
  });
});

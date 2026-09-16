import { expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export function expectTrackedAllocations(sourceText: string): void {
  const dir = mkdtempSync(join(tmpdir(), "bpl-path-ownership-"));
  try {
    const source = join(dir, "main.bpl");
    const tracker = join(dir, "tracker.c");
    writeFileSync(source, sourceText);
    writeFileSync(
      tracker,
      `#include <assert.h>
#include <stdlib.h>
static void *owned[4096];
static int live,active,allocations,fail_at=-1;
void tracking_begin(void) {active=1;}
int tracking_live(void) {return live;}
void tracking_fail(int index) {allocations=0;fail_at=index;}
void *tracked_malloc(size_t size) {
 if(active && allocations++==fail_at)return NULL;
 void *value=malloc(size);
 if(active && value) {assert(live<4096);owned[live++]=value;}
 return value;
}
void tracked_free(void *value) {
 for(int i=0;i<live;i++)if(owned[i]==value) {owned[i]=owned[--live];break;}
 free(value);
}`,
    );
    const trackerObject = join(dir, "tracker.o");
    const trackerBuild = spawnSync(
      process.env.CC || "clang",
      ["-c", tracker, "-o", trackerObject],
      { encoding: "utf8" },
    );
    expect(trackerBuild.stderr).toBe("");
    expect(trackerBuild.status).toBe(0);
    for (const opt of [0, 3]) {
      const llvm = join(dir, `main-${opt}.ll`);
      const binary = join(dir, `main-${opt}`);
      const generated = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          source,
          "-O",
          String(opt),
          "--emit",
          "llvm",
          "-o",
          llvm,
          "--object",
          trackerObject,
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(generated.stderr).toBe("");
      expect(generated.status).toBe(0);
      // Instrument BPL allocations without relying on platform-specific linker
      // wrapping. Native runtime initialization is outside the measured window.
      writeFileSync(
        llvm,
        readFileSync(llvm, "utf8")
          .replaceAll("@malloc(", "@tracked_malloc(")
          .replaceAll("@free(", "@tracked_free("),
      );
      const compilation = spawnSync(
        process.env.CC || "clang",
        [
          `-O${opt}`,
          "-Wno-override-module",
          llvm,
          trackerObject,
          resolve("lib/runtime_support.o"),
          "-lm",
          ...(process.platform === "linux" ? ["-ldl"] : []),
          "-o",
          binary,
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(compilation.stderr).toBe("");
      expect(compilation.status).toBe(0);
      const run = spawnSync(binary, [], { encoding: "utf8", timeout: 15000 });
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

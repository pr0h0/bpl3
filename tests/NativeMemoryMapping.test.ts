import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("native allocator mappings validate sizes, platform pages, and OS failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-native-mapping-"));
  try {
    const source = join(dir, "test.c");
    writeFileSync(
      source,
      `#define _GNU_SOURCE
#include <assert.h>
#include <stdint.h>
#include <sys/mman.h>
#include <unistd.h>
static int fail_mapping, mapping_calls, fail_page_size;
static void *test_mmap(void *p,size_t n,int prot,int flags,int fd,off_t offset) {
 mapping_calls++;
 if(fail_mapping)return MAP_FAILED;
 return mmap(p,n,prot,flags,fd,offset);
}
static long test_sysconf(int name) {return fail_page_size ? -1 : sysconf(name);}
#define mmap test_mmap
#define sysconf test_sysconf
#include "${resolve("lib/runtime_support.c")}"
#undef mmap
#undef sysconf
int32_t __bpl_stack_depth=0;
int main(void) {
 assert(!__bpl_memory_map(0));assert(!__bpl_memory_map(UINT64_MAX));
 assert(!__bpl_memory_map((uint64_t)PTRDIFF_MAX+1));assert(mapping_calls==0);
 uint64_t page=__bpl_memory_page_size();assert(page>0);
 fail_page_size=1;assert(__bpl_memory_page_size()==0);fail_page_size=0;
 fail_mapping=1;assert(!__bpl_memory_map(page));fail_mapping=0;
 unsigned char *p=__bpl_memory_map(page);assert(p);
 assert((uintptr_t)p%page==0);p[0]=42;p[page-1]=43;
 assert(p[0]==42 && p[page-1]==43);__bpl_memory_unmap(p,page);
 __bpl_memory_unmap(NULL,0);return 0;
}`,
    );
    for (const opt of [0, 3]) {
      const binary = join(dir, `native-${opt}`);
      const sanitizerFlags =
        process.env.BPL_TEST_NATIVE_SANITIZERS === "1"
          ? ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
          : [];
      const compilation = spawnSync(
        process.env.CC || "clang",
        [
          `-O${opt}`,
          ...sanitizerFlags,
          source,
          "-o",
          binary,
          ...(process.platform === "linux" ? ["-ldl"] : []),
        ],
        { encoding: "utf8" },
      );
      expect(compilation.stderr).toBe("");
      expect(compilation.status).toBe(0);
      const run = spawnSync(binary, [dir], {
        encoding: "utf8",
        timeout: 15000,
      });
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

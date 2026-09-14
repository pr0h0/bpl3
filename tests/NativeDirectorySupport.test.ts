import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("native directory helpers discard partial listings and release resources on every injected failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-native-directory-"));
  try {
    const entries = join(dir, "entries");
    mkdirSync(entries);
    for (let i = 0; i < 40; i++) writeFileSync(join(entries, `name-${i}`), "");
    const source = join(dir, "test.c");
    writeFileSync(
      source,
      `#define _GNU_SOURCE
#include <stdlib.h>
#include <stdint.h>
#include <assert.h>
#include <dirent.h>
#include <errno.h>
static int allocations, fail_allocation=-1, live, directories, reads, fail_read=-1, close_error;
static void *test_malloc(size_t n) {
 if(allocations++==fail_allocation) return NULL;
 void *p=malloc(n);if(p)live++;errno=EDOM;return p;
}
static void *test_realloc(void *p,size_t n) {
 if(allocations++==fail_allocation) return NULL;
 int was_null=p==NULL;void *result=realloc(p,n);
 if(result && was_null)live++;errno=EDOM;return result;
}
static void test_free(void *p) {if(p)live--;free(p);}
static DIR *test_opendir(const char *path) {
 DIR *d=opendir(path);if(d)directories++;return d;
}
static struct dirent *test_readdir(DIR *d) {
 if(reads++==fail_read) {errno=ENOSPC;return NULL;}
 return readdir(d);
}
static int test_closedir(DIR *d) {
 int result=closedir(d);directories--;
 if(close_error) {errno=EBUSY;return -1;}return result;
}
#define malloc test_malloc
#define realloc test_realloc
#define free test_free
#define opendir test_opendir
#define readdir test_readdir
#define closedir test_closedir
#include "${resolve("lib/runtime_support.c")}"
#undef malloc
#undef realloc
#undef free
#undef opendir
#undef readdir
#undef closedir
int32_t __bpl_stack_depth=0;
int main(int argc,char **argv) {
 assert(argc==2);char **names=NULL;int32_t count=0;
 assert(__bpl_list_dir(argv[1],&names,&count)==0);
 assert(count==40 && live==41 && !directories);
 for(int i=0;i<40;i++) {
  char expected[20];snprintf(expected,sizeof(expected),"name-%d",i);int found=0;
  for(int j=0;j<count;j++)if(!strcmp(names[j],expected))found++;
  assert(found==1);
 }
 int total_allocations=allocations;
 __bpl_free_dir_names(names,count);assert(!live);
 for(int i=0;i<total_allocations;i++) {
  allocations=0;fail_allocation=i;
  assert(__bpl_list_dir(argv[1],&names,&count)==ENOMEM);
  assert(!names && !count && !live && !directories);
 }
 fail_allocation=-1;
 for(int i=0;i<2;i++) {
  reads=0;fail_read=5;close_error=i;
  assert(__bpl_list_dir(argv[1],&names,&count)==ENOSPC);
  assert(!names && !count && !live && !directories);
 }
 fail_read=-1;close_error=1;
 assert(__bpl_list_dir(argv[1],&names,&count)==EBUSY);
 assert(!names && !count && !live && !directories);close_error=0;
 assert(__bpl_list_dir(NULL,&names,&count)==EINVAL);
 assert(!names && !count && !directories);
 assert(__bpl_list_dir(argv[1],NULL,&count)==EINVAL);
 assert(__bpl_list_dir(argv[1],&names,NULL)==EINVAL);
 void *data=NULL;
 assert(__bpl_fs_allocate_entries(-1,8,&data)==EINVAL && !data);
 assert(__bpl_fs_allocate_entries(1,0,&data)==EINVAL && !data);
 assert(__bpl_fs_allocate_entries(1,-1,&data)==EINVAL && !data);
 assert(__bpl_fs_allocate_entries(3,INT64_MAX,&data)==EOVERFLOW && !data);
 assert(__bpl_fs_allocate_entries(0,8,&data)==0 && !data);
 assert(__bpl_fs_allocate_entries(1,8,NULL)==EINVAL);
 allocations=0;fail_allocation=0;
 assert(__bpl_fs_allocate_entries(2,32,&data)==ENOMEM && !data && !live);
 fail_allocation=-1;
 assert(__bpl_fs_allocate_entries(2,32,&data)==0 && data && live==1);
 memset(data,0xab,64);test_free(data);assert(!live && !directories);return 0;
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
      const run = spawnSync(binary, [entries], { encoding: "utf8" });
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

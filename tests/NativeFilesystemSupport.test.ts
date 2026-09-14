import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("native file helpers clean up allocation/read/close failures and complete short writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-native-files-"));
  try {
    const source = join(dir, "test.c");
    const input = join(dir, "input");
    writeFileSync(input, Buffer.alloc(12000, 0xab));
    writeFileSync(
      source,
      `#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <assert.h>
#include <unistd.h>
static int allocation_count, fail_after=-1, live, close_error;
static void *test_malloc(size_t n) {
 if(allocation_count++==fail_after) return NULL;
 void *p=malloc(n);if(p)live++;return p;
}
static void *test_realloc(void *p,size_t n) {
 if(allocation_count++==fail_after) return NULL;
 return realloc(p,n);
}
static void test_free(void *p) {if(p)live--;free(p);}
static int test_close(FILE *f) {int status=fclose(f);return close_error ? -1 : status;}
static size_t test_write(const void *p,size_t size,size_t n,FILE *f) {
 return fwrite(p,size,n>3?3:n,f);
}
#define malloc test_malloc
#define realloc test_realloc
#define free test_free
#define fclose test_close
#define fwrite test_write
#include "${resolve("lib/runtime_support.c")}" 
#undef malloc
#undef realloc
#undef free
#undef fclose
#undef fwrite
int32_t __bpl_stack_depth=0;
int main(int argc,char **argv) {
 assert(argc==3);char *data=NULL;int32_t length=0;
 for(int failure=0;failure<3;failure++) {
  allocation_count=0;fail_after=failure;
  assert(__bpl_read_file(argv[1],&data,&length)==ENOMEM);
  assert(!data && !length && !live);
 }
 fail_after=-1;assert(__bpl_read_file(argv[1],&data,&length)==0);
 assert(length==12000 && live==1 && data[length]==0);
 for(int i=0;i<length;i++)assert((unsigned char)data[i]==0xab);
 test_free(data);assert(!live);
 close_error=1;assert(__bpl_read_file(argv[1],&data,&length)!=0);
 assert(!data && !length && !live);close_error=0;
 assert(__bpl_read_file(argv[2],&data,&length)!=0);
 assert(!data && !length && !live);
 assert(__bpl_read_file(NULL,&data,&length)==EINVAL && !data && !length);
 FILE *output=tmpfile();assert(output);
 const char text[]={'a',0,'b','c','d','e','f',0,'g'};
 assert(__bpl_file_write(output,text,sizeof(text))==0);
 assert(fseek(output,0,SEEK_SET)==0);
 char actual[sizeof(text)+3];memset(actual,0x55,sizeof(actual));int32_t count=99;
 assert(__bpl_file_read(output,NULL,0,&count)==0 && count==0);
 assert(__bpl_file_read(output,NULL,1,&count)==EINVAL && count==0);
 assert(__bpl_file_read(output,actual,-1,&count)==EINVAL && count==0);
 assert(__bpl_file_read(output,actual,sizeof(actual),&count)==0 && count==sizeof(text));
 assert(memcmp(text,actual,sizeof(text))==0);
 for(size_t i=sizeof(text);i<sizeof(actual);i++)assert(actual[i]==0x55);
 assert(__bpl_file_read(output,actual,sizeof(actual),&count)==0 && count==0);
 assert(__bpl_file_read(NULL,actual,1,&count)==EBADF && count==0);
 assert(__bpl_file_read(output,actual,1,NULL)==EINVAL);fclose(output);
 int descriptors[2];assert(pipe(descriptors)==0);
 assert(write(descriptors[1],text,sizeof(text))==sizeof(text));close(descriptors[1]);
 FILE *stream=fdopen(descriptors[0],"rb");assert(stream);
 assert(__bpl_file_read(stream,actual,sizeof(actual),&count)==0 && count==sizeof(text));
 assert(memcmp(text,actual,sizeof(text))==0);
 assert(__bpl_file_read(stream,actual,sizeof(actual),&count)==0 && count==0);
 fclose(stream);
 assert(__bpl_file_write(NULL,text,sizeof(text))==EINVAL);
 assert(!live);return 0;
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
      const run = spawnSync(binary, [input, dir], { encoding: "utf8" });
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

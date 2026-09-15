import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("native metadata helpers check errors and inspect FIFOs and sockets without opening them", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-native-metadata-"));
  try {
    const source = join(dir, "test.c");
    writeFileSync(
      source,
      `#define _GNU_SOURCE
#include <assert.h>
#include <stdint.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
static int forced_error, fake_size;
static int test_stat(const char *path,struct stat *info) {
 if(forced_error) {errno=forced_error;return -1;}
 if(fake_size) {
  memset(info,0,sizeof(*info));info->st_mode=S_IFREG;
  info->st_size=fake_size==1 ? -1 : INT64_MAX;return 0;
 }
 return stat(path,info);
}
static int test_lstat(const char *path,struct stat *info) {
 if(forced_error) {errno=forced_error;return -1;}
 return lstat(path,info);
}
#define stat(path,info) test_stat(path,info)
#define lstat(path,info) test_lstat(path,info)
#include "${resolve("lib/runtime_support.c")}"
#undef stat
#undef lstat
int32_t __bpl_stack_depth=0;
int main(int argc,char **argv) {
 assert(argc==2 && chdir(argv[1])==0);
 int64_t size=99;int32_t kind=99;
 assert(__bpl_file_info(NULL,1,&size,&kind)==EINVAL && !size && !kind);
 assert(__bpl_file_info(".",2,&size,&kind)==EINVAL && !size && !kind);
 assert(__bpl_file_info(".",-1,&size,&kind)==EINVAL && !size && !kind);
 assert(__bpl_file_info(".",1,NULL,&kind)==EINVAL);
 assert(__bpl_file_info(".",1,&size,NULL)==EINVAL);
 assert(__bpl_file_info(".",1,&size,&kind)==0 && kind==2);
 assert(__bpl_file_info("missing",0,&size,&kind)==ENOENT && !size && !kind);
 assert(__bpl_file_info("missing",1,&size,&kind)==ENOENT && !size && !kind);
 assert(!__bpl_path_exists(NULL) && !__bpl_path_exists("missing"));
 for(int follow=0;follow<=1;follow++) {
  forced_error=EACCES;size=99;kind=99;
  assert(__bpl_file_info(".",follow,&size,&kind)==EACCES && !size && !kind);
  assert(!__bpl_path_exists("."));
 }
 forced_error=0;fake_size=1;
 assert(__bpl_file_info(".",1,&size,&kind)==EOVERFLOW && !size && !kind);
 if(sizeof(off_t)>=8) {
  fake_size=2;
  assert(__bpl_file_info(".",1,&size,&kind)==0 && size==INT64_MAX && kind==1);
 }
 fake_size=0;
 assert(mkfifo("fifo",0600)==0);alarm(10);
 assert(__bpl_path_exists("fifo"));
 assert(__bpl_file_info("fifo",1,&size,&kind)==0 && kind==0);
 alarm(0);assert(unlink("fifo")==0);
 int fd=socket(AF_UNIX,SOCK_STREAM,0);assert(fd>=0);
 struct sockaddr_un address={0};address.sun_family=AF_UNIX;
#ifdef __APPLE__
 address.sun_len=sizeof(address);
#endif
 strcpy(address.sun_path,"socket");
 assert(bind(fd,(struct sockaddr *)&address,sizeof(address))==0);
 assert(__bpl_path_exists("socket"));
 assert(__bpl_file_info("socket",1,&size,&kind)==0 && kind==0);
 assert(close(fd)==0 && unlink("socket")==0);
 return 0;
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

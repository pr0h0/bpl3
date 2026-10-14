import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.skipIf(process.platform !== "linux")(
  "BPL guards recursion on small foreign thread stacks at every optimization level",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-ffi-small-stack-"));
    function run(command: string, args: string[]) {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: 60000,
      });
      if (result.status !== 0)
        throw new Error(
          `${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`,
        );
      return result;
    }
    try {
      writeFileSync(
        join(dir, "api.bpl"),
        `
   extern touch(buffer:*char) ret int;
   @[noinline] frame recurse(count:int) ret int {
    local buffer:char[256];local value:int=touch(buffer);
    if(count==0){return value;}
    return value+recurse(count-1);
   }
   @[c_export] frame bounded_recursion() ret int {
    try {return recurse(2048);}
    catch(error:StackOverflowError) {return 42;}
    return -1;
   }
  `,
      );
      writeFileSync(
        join(dir, "provider.c"),
        "int touch(char *buffer){buffer[255]=1;return buffer[255];}",
      );
      run("clang", [
        "-O3",
        "-fPIC",
        "-c",
        join(dir, "provider.c"),
        "-o",
        join(dir, "provider.o"),
      ]);
      writeFileSync(
        join(dir, "host.c"),
        `
   #include <pthread.h>
   #include <dlfcn.h>
   #include <errno.h>
   #include <stdint.h>
   static int (*bounded)(void);
   static void *(*initialize)(void *);
   static void *small(void *arg) {
    (void)arg;
    char marker; errno=EDOM; void *limit=initialize(&marker);
    if(errno!=EDOM || (uintptr_t)limit>=(uintptr_t)&marker)return (void *)1;
    for(int i=0;i<20;i++)if(bounded()!=42)return (void *)2;
    return 0;
   }
   static void *normal(void *arg) {(void)arg;return bounded()==2049 ? 0 : (void *)3;}
   int main(int argc,char **argv) {
    if(argc!=2)return 1;
    void *library=dlopen(argv[1],RTLD_NOW);if(!library)return 2;
    bounded=(int(*)(void))dlsym(library,"bounded_recursion");
    initialize=(void *(*)(void *))dlsym(library,"__bpl_initialize_stack_limit");
    if(!bounded||!initialize)return 3;
    pthread_attr_t attr;if(pthread_attr_init(&attr))return 4;
    pthread_t first,second;void *result=0;
    if(pthread_create(&first,0,normal,0)||pthread_join(first,&result)||result)return 5;
    if(pthread_attr_setstacksize(&attr,131072))return 6;
    if(pthread_create(&second,&attr,small,0)||pthread_join(second,&result)||result)return 7;
    pthread_attr_destroy(&attr);dlclose(library);return 0;
   }
  `,
      );
      run("clang", [
        "-O3",
        "-pthread",
        join(dir, "host.c"),
        "-ldl",
        "-o",
        join(dir, "host"),
      ]);
      for (const opt of [0, 1, 2, 3]) {
        const library = join(dir, "libapi.so");
        run("bun", [
          resolve("index.ts"),
          "build",
          join(dir, "api.bpl"),
          "--shared",
          "--object",
          join(dir, "provider.o"),
          "-O",
          String(opt),
          "-o",
          library,
        ]);
        expect(run(join(dir, "host"), [library]).status).toBe(0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

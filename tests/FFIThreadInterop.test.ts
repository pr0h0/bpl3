import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Compiler } from "../compiler";

test.skipIf(process.platform !== "linux")("concurrent C host callbacks isolate BPL stack, exceptions and defers", () => {
  const dir=mkdtempSync(join(tmpdir(),"bpl-ffi-threads-"));
  function run(command:string,args:string[]) {
    const result=spawnSync(command,args,{encoding:"utf8",timeout:60000});
    if(result.status!==0)throw new Error(`${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  try {
    writeFileSync(join(dir,"api.bpl"),`
      @[c_export] frame compute(value:long) ret long {
        local result:long=0;
        loop(local index:int=0;index<10;index++) {result=result+value;}
        return result;
      }
      frame private_callback(value:long) ret long {
        local result:long=0;
        loop(local index:int=0;index<10;index++) {result=result+value;}
        return result;
      }
      @[c_export] frame factory() ret Func<long>(long) {return private_callback;}
      @[c_export] frame isolated(value:long,callback:Func<long>(long)) ret long {
        local result:long=0; local cleaned:long=0; local cleanup:*long=&cleaned;
        try {defer {*cleanup=*cleanup+1;} callback(value); throw value;}
        catch(error:long) {result=error;}
        return result+cleaned*1000000;
      }
    `);
    writeFileSync(join(dir,"host.c"),`
      #include <pthread.h>
      #include <dlfcn.h>
      #include <stdint.h>
      #include <stdio.h>
      static pthread_barrier_t barrier;
      static void *library;
      static int64_t (*compute)(int64_t);
      static int64_t (*returned)(int64_t);
      static int64_t (*isolated)(int64_t,int64_t(*)(int64_t));
      static int64_t wait_for_peers(int64_t value) {pthread_barrier_wait(&barrier);return value;}
      static void *worker(void *arg) {
        int64_t id=(intptr_t)arg;
        int failed=0;
        void **limit=(void **)dlsym(library,"__bpl_stack_limit");
        if(!limit || *limit!=0 || returned(1)!=10)failed=1;
        if(REQUIRE_LIMIT && *limit==0)failed=1;
        for(int round=0;round<100;round++) {
          int64_t value=id*1000+round;
          if(compute(1)!=10)failed=1;
          if(isolated(value,wait_for_peers)!=value+1000000)failed=1;
        }
        return (void *)(intptr_t)failed;
      }
      int main(int argc,char **argv) {
        if(argc!=2)return 2;
        library=dlopen(argv[1],RTLD_NOW);if(!library)return 3;
        compute=(int64_t(*)(int64_t))dlsym(library,"compute");
        isolated=(int64_t(*)(int64_t,int64_t(*)(int64_t)))dlsym(library,"isolated");
        int64_t (*(*factory)(void))(int64_t)=(int64_t(*(*)(void))(int64_t))dlsym(library,"factory");
        if(!compute||!isolated||!factory||compute(1)!=10)return 4;
        returned=factory();if(!returned)return 8;
        if(pthread_barrier_init(&barrier,0,8))return 5;
        pthread_t threads[8];
        for(int i=0;i<8;i++)if(pthread_create(&threads[i],0,worker,(void *)(intptr_t)(i+1)))return 6;
        for(int i=0;i<8;i++){void *result=0;if(pthread_join(threads[i],&result)||result)return 7;}
        pthread_barrier_destroy(&barrier);dlclose(library);puts("threads-ok");return 0;
      }
    `);
    for(const opt of [0,2,3]) {
      run("clang",["-O3",`-DREQUIRE_LIMIT=${opt===3?1:0}`,join(dir,"host.c"),"-pthread","-ldl","-o",join(dir,"host")]);
      const library=join(dir,"libapi.so");
      run("bun",[resolve("index.ts"),"build",join(dir,"api.bpl"),"--shared","-O",String(opt),"-o",library]);
      expect(run(join(dir,"host"),[library]).stdout).toBe("threads-ok\n");
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
},240000);

test("native control state is TLS while Wasm retains per-instance globals",()=>{
  const source=`frame main() ret int {try {throw 7;} catch(error:int) {return error;} return 0;}`;
  for(const target of ["x86_64-unknown-linux-gnu","aarch64-unknown-linux-gnu","arm64-apple-darwin","i686-unknown-linux-gnu"]) {
    const result=new Compiler({filePath:"tls.bpl",target}).compile(source);
    expect(result.success).toBe(true);
    expect(result.output).toContain("@exception_top = external thread_local global");
    expect(result.output).toContain("@exception_value = external thread_local global");
    expect(result.output).toContain("@defer_top = external thread_local global");
  }
  const wasm=new Compiler({filePath:"tls.bpl",target:"wasm32-unknown-unknown"}).compile(source);
  expect(wasm.success).toBe(true);
  expect(wasm.output).toContain("@exception_top = external global");
  expect(wasm.output).not.toContain("thread_local");
});

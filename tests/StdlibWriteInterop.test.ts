import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { compileToLLVM } from "./helpers";

test.skipIf(process.platform !== "linux")("portable std/c write preserves 64-bit counts/results and native failures", () => {
  const dir=mkdtempSync(join(tmpdir(),"bpl-write-width-"));
  function run(command:string,args:string[]) {
    const result=spawnSync(command,args,{encoding:"utf8",timeout:30000});
    if(result.status!==0)throw new Error(`${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  try {
    writeFileSync(join(dir,"provider.c"),`
      #include <unistd.h>
      #include <stdint.h>
      #include <stddef.h>
      #include <errno.h>
      #include <sys/syscall.h>
      ssize_t write(int fd,const void *buffer,size_t count) {
        if(fd==123) return count==UINT64_C(4294967296)?(ssize_t)count:-1;
        return syscall(SYS_write,fd,buffer,count);
      }
      int last_errno(void) {return errno;}
      int is_invalid(void) {return errno==EINVAL;}
      int is_fault(void) {return errno==EFAULT;}
    `);
    run("clang",["-O3","-c",join(dir,"provider.c"),"-o",join(dir,"provider.o")]);
    writeFileSync(join(dir,"main.bpl"),`
      import write from "std/c.bpl";
      extern is_invalid() ret int; extern is_fault() ret int;
      frame main() ret int {
        local value:char='X';
        if(write(123,&value,4294967296)!=4294967296) {return 1;}
        if(write(-1,&value,1)!=-1) {return 2;}
        if(write(1,nullptr,0)!=0) {return 3;}
        if(write(1,&value,-1)!=-1 || is_invalid()!=1) {return 4;}
        if(write(1,nullptr,1)!=-1 || is_fault()!=1) {return 5;}
        if(write(1,&value,1)!=1) {return 6;}
        return 0;
      }
    `);
    for(const opt of [0,3]) {
      run("bun",[resolve("index.ts"),"build",join(dir,"main.bpl"),"--object",join(dir,"provider.o"),"-O",String(opt),"-o",join(dir,"out")]);
      expect(run(join(dir,"out"),[]).stdout).toBe("X");
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
},90000);

test("unused portable write imports do not pull runtime into printf-only programs",()=>{
  const llvm=compileToLLVM(`import printf from "std/c.bpl"; frame main() ret int {printf("ok\\n");return 0;}`);
  expect(llvm).not.toContain("@__bpl_write");
  expect(llvm).not.toContain("@__bpl_install_signal_handlers");
});

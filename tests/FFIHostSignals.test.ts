import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Compiler } from "../compiler";

const unix = process.platform === "linux" || process.platform === "darwin";
test.skipIf(!unix)("BPL libraries retain host handlers and native main respects existing handlers", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-host-signals-"));
  function run(command:string,args:string[]) {
    const result=spawnSync(command,args,{encoding:"utf8",timeout:30000});
    if(result.status!==0) throw new Error(`${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  try {
    const suffix=process.platform==="darwin"?"dylib":"so";
    const library=join(dir,`libapi.${suffix}`);
    writeFileSync(join(dir,"api.bpl"),"@[c_export] frame add(a:long,b:long) ret long {return a+b;}");
    writeFileSync(join(dir,"host.c"),`
      #include <signal.h>
      #include <dlfcn.h>
      #include <stdint.h>
      static void owned(int sig,siginfo_t *info,void *context) {(void)sig;(void)info;(void)context;}
      int main(int argc,char **argv) {
        if(argc!=2) return 2;
        int signals[]={SIGSEGV,SIGFPE,SIGILL,SIGABRT,SIGBUS};
        struct sigaction action={0},before[5],after;
        action.sa_sigaction=owned;action.sa_flags=SA_SIGINFO;sigemptyset(&action.sa_mask);
        for(int i=0;i<5;i++) {if(sigaction(signals[i],&action,0)||sigaction(signals[i],0,&before[i]))return 3;}
        void *library=dlopen(argv[1],RTLD_NOW);if(!library)return 4;
        int64_t (*add)(int64_t,int64_t)=(int64_t(*)(int64_t,int64_t))dlsym(library,"add");
        if(!add||add(20,22)!=42)return 5;
        dlclose(library);
        for(int i=0;i<5;i++) {
          if(sigaction(signals[i],0,&after)||after.sa_sigaction!=before[i].sa_sigaction)return 6;
        }
        return 0;
      }
    `);
    run("clang",[join(dir,"host.c"),...(process.platform==="linux"?["-ldl"]:[]),"-o",join(dir,"host")]);
    for(const opt of [0,3]) {
      run("bun",[resolve("index.ts"),"build",join(dir,"api.bpl"),"--shared","-O",String(opt),"-o",library]);
      run(join(dir,"host"),[library]);
    }
    writeFileSync(join(dir,"main.bpl"),`
      extern raise(sig:int) ret int;
      frame main() ret int {local marker:int=0; raise(6); return marker;}
    `);
    run("bun",[resolve("index.ts"),"build",join(dir,"main.bpl"),"-o",join(dir,"main")]);
    const crashed=spawnSync("bash",["-c",'ulimit -c 0; exec "$1"',"bpl-test",join(dir,"main")],{encoding:"utf8",timeout:30000});
    expect(crashed.signal).toBe("SIGABRT");
    expect(crashed.stderr).toContain("RUNTIME ERROR");
    writeFileSync(join(dir,"owned.c"),`
      #include <signal.h>
      #include <unistd.h>
      static void owned(int sig) {(void)sig; _exit(42);}
      __attribute__((constructor)) static void setup(void) {signal(SIGABRT,owned);}
    `);
    run("clang",["-c",join(dir,"owned.c"),"-o",join(dir,"owned.o")]);
    run("bun",[resolve("index.ts"),"build",join(dir,"main.bpl"),"--object",join(dir,"owned.o"),"-o",join(dir,"main")]);
    const retained=spawnSync(join(dir,"main"),[],{encoding:"utf8",timeout:30000});
    expect(retained.status).toBe(42);
    expect(retained.stderr).toBe("");
  } finally {rmSync(dir,{recursive:true,force:true});}
},90000);

test("signal initialization does not pull runtime into simple native programs or Wasm",()=>{
  for(const source of ["frame main() ret int {return 0;}","@[c_export] frame add(a:long,b:long) ret long {return a+b;}"]) {
    const result=new Compiler({filePath:"lean.bpl",optimizationLevel:3}).compile(source);
    expect(result.success).toBe(true);
    expect(result.output).not.toContain("__bpl_install_signal_handlers");
  }
  const wasm=new Compiler({filePath:"wasm.bpl",target:"wasm32-unknown-unknown"}).compile("frame main() ret int {local value:int=42;return value;}");
  expect(wasm.success).toBe(true);
  expect(wasm.output).not.toContain("__bpl_install_signal_handlers");
});

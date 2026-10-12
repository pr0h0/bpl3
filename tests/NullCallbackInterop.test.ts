import { test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.skipIf(process.platform !== "linux")(
  "null foreign callbacks raise catchable errors before invocation",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-null-callback-"));
    function run(command: string, args: string[]) {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: 30000,
      });
      if (result.status !== 0)
        throw new Error(
          `${command}: status=${result.status}, signal=${result.signal}\n${result.stdout}\n${result.stderr}`,
        );
    }
    try {
      const source = join(dir, "api.bpl");
      writeFileSync(
        source,
        `
      type Callback=Func<int>(int);
      frame apply(f:Lambda<int>(int),x:int) ret int {return f(x);}
      struct Slot {callback:Callback,}
      @[c_export] frame checked(f:Callback,mode:int) ret int {
        local closure:Lambda<int>(int)=f;
        local cleanup:int=0;local cleanup_ptr:*int=&cleanup;
        try {
          defer {*cleanup_ptr+=1;}
          if(mode==0) return f(41);
          if(mode==1) return apply(f,41);
          if(mode==2) return closure(41);
          if(mode==3) {local slot:Slot=Slot {callback:f};return slot.callback(41);}
          local callbacks:Callback[1]=[f];return callbacks[0](41);
        } catch(e:NullAccessError) {
          if(cleanup!=1) return -2;
          return e.code;
        }
        return -1;
      }
    `,
      );
      writeFileSync(
        join(dir, "host.c"),
        `
      #include "api.h"
      #include <stddef.h>
      static int32_t increment(int32_t x) {return x+1;}
      int main(void) {
        for(int mode=0;mode<5;++mode) {
          if(checked(increment,mode)!=42) return 1;
          if(checked(NULL,mode)!=7) return 2;
        }
        return 0;
      }
    `,
      );
      for (const opt of [0, 3]) {
        run("bun", [
          resolve("index.ts"),
          "build",
          source,
          "--shared",
          "--header",
          join(dir, "api.h"),
          "-O",
          String(opt),
          "-o",
          join(dir, "libapi.so"),
        ]);
        for (const [compiler, language] of [
          ["clang", "c"],
          ["clang++", "c++"],
        ] as const) {
          run(compiler, [
            "-x",
            language,
            "-O3",
            "-Werror",
            join(dir, "host.c"),
            "-L",
            dir,
            "-lapi",
            `-Wl,-rpath,${dir}`,
            "-o",
            join(dir, "host"),
          ]);
          run(join(dir, "host"), []);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("generic C varargs preserve unsigned narrow values and default promotions", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-generic-c-varargs-"));
  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 30000,
    });
    if (result.status !== 0)
      throw new Error(
        `${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`,
      );
    return result;
  }
  try {
    writeFileSync(
      join(dir, "main.bpl"),
      `
      extern printf(format:string,...) ret int;
      extern native_integer(count:int,...) ret long;
      extern native_float(count:int,...) ret double;
      extern native_callback(count:int,...) ret long;
      type Byte=u8; type Word=ushort; type Signed=i8; type ShortAlias=short;
      frame emit<T>(value:T) {printf("%d\\n",value);}
      frame probe<T>(value:T) ret long {return native_integer(1,value);}
      frame relay<U>(value:U) ret long {return probe<U>(value);}
      frame floating<T>(value:T) ret double {return native_float(1,value);}
      type Callback<T>=Func<T>(T);
      frame inc(value:int) ret int {return value+1;}
      frame callback<T>(value:T) ret long {return native_callback(1,value);}
      frame main() ret int {
        emit<Byte>(255 as Byte); emit<Word>(65535 as Word);
        if(probe<Byte>(255 as Byte)!=255) {return 1;}
        if(relay<Word>(65535 as Word)!=65535) {return 2;}
        if(relay<i8>(-128 as i8)!=-128) {return 3;}
        if(probe<short>(-32768 as short)!=-32768) {return 4;}
        if(relay<Signed>(-128 as Signed)!=-128 || probe<ShortAlias>(-32768 as ShortAlias)!=-32768) {return 7;}
        if(probe<bool>(true)!=1 || relay<bool>(false)!=0) {return 5;}
        if(floating<f32>(1.25 as f32)!=1.25) {return 6;}
        if(callback<Callback<int>>(inc)!=42) {return 8;}
        return 0;
      }
    `,
    );
    writeFileSync(
      join(dir, "provider.c"),
      `
      #include <stdarg.h>
      #include <stdint.h>
      #ifdef __cplusplus
      extern "C" {
      #endif
      int64_t native_integer(int count,...) {
        va_list args; va_start(args,count);
        int value=va_arg(args,int); va_end(args); return value;
      }
      double native_float(int count,...) {
        va_list args; va_start(args,count);
        double value=va_arg(args,double); va_end(args); return value;
      }
      typedef int32_t (*Callback)(int32_t);
      int64_t native_callback(int count,...) {
        va_list args; va_start(args,count);
        Callback value=va_arg(args,Callback); va_end(args); return value(41);
      }
      #ifdef __cplusplus
      }
      #endif
    `,
    );
    for (const [compiler, language] of [
      ["clang", "c"],
      ["clang++", "c++"],
    ] as const) {
      run(compiler, [
        "-x",
        language,
        "-O3",
        "-c",
        join(dir, "provider.c"),
        "-o",
        join(dir, "provider.o"),
      ]);
      for (const opt of [0, 3]) {
        run("bun", [
          resolve("index.ts"),
          "build",
          join(dir, "main.bpl"),
          "--object",
          join(dir, "provider.o"),
          "-O",
          String(opt),
          "-o",
          join(dir, "out"),
        ]);
        expect(run(join(dir, "out"), []).stdout).toBe("255\n65535\n");
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

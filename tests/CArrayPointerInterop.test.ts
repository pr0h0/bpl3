import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.skipIf(process.platform !== "linux")(
  "fixed array pointers cross C and C++ boundaries with generated declarations",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-array-ffi-"));
    function run(command: string, args: string[]) {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: 30000,
      });
      if (result.status !== 0)
        throw new Error(`${command}: ${result.stdout}\n${result.stderr}`);
    }
    try {
      const source = join(dir, "api.bpl");
      writeFileSync(
        source,
        `
        type Row = int[2];
        type Grid = Row[3];
        type Pair<T> = T[2];
        type Pointers = *int[2];
        type RowPointer = *Row;
        type RowPointers = RowPointer[2];
        @[c_export] frame row_alias(p:RowPointer) ret RowPointer { return p; }
        @[c_export] frame nested(p:*RowPointers) ret *RowPointers { return p; }
        @[c_export] frame nested_read(p:*RowPointers) ret int { return p[1][1]; }
        @[c_export] frame nested_write(p:*RowPointers) { p[1][0]=77; }
        extern native_sum(p:*Grid) ret int;
        @[c_export] frame sum(p:*Grid) ret int { return native_sum(p); }
        @[c_export] frame update(p:*Row) ret *Row { p[1]=42; return p; }
        @[c_export] frame indirect(p:**Row) ret int { return p[0][1]; }
        @[c_export] frame generic_row(p:*Pair<int>) ret int { return p[1]; }
        @[c_export] frame read_pointer(p:*Pointers) ret int { return *p[1]; }
      `,
      );
      writeFileSync(
        join(dir, "provider.c"),
        `
        #include <stdint.h>
        int32_t native_sum(int32_t (*p)[3][2]) {
          return (*p)[0][0]+(*p)[2][1];
        }
      `,
      );
      run("clang", [
        "-fPIC",
        "-c",
        join(dir, "provider.c"),
        "-o",
        join(dir, "provider.o"),
      ]);
      writeFileSync(
        join(dir, "host.c"),
        `
        #include "api.h"
        int main(void) {
          int32_t grid[3][2]={{10,11},{20,21},{30,32}};
          int32_t (*row)[2]=&grid[0];
          int32_t (*row_pointers[2])[2]={&grid[0], &grid[2]};
          int32_t *pointers[2]={&grid[0][0],&grid[2][1]};
          if(sum(&grid)!=42 || generic_row(row)!=11 || row_alias(row)!=row) return 1;
          if(update(row)!=row || grid[0][1]!=42 || indirect(&row)!=42) return 2;
          if(read_pointer(&pointers)!=32 || nested(&row_pointers)!=&row_pointers) return 3;
          if(nested_read(&row_pointers)!=32) return 4;
          nested_write(&row_pointers);
          if(grid[2][0]!=77) return 5;
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
          "--object",
          join(dir, "provider.o"),
          "-O",
          String(opt),
          "-o",
          join(dir, "libapi.so"),
        ]);
        expect(readFileSync(join(dir, "api.h"), "utf8")).toContain("[3][2]");
        for (const [compiler, language] of [
          ["clang", "c"],
          ["clang++", "c++"],
        ]) {
          run(compiler!, [
            "-x",
            language!,
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
  180000,
);

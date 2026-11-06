import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.skipIf(process.platform !== "linux" && process.platform !== "darwin")(
  "native named traces retain current and caller frames through clear, return and reuse",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-native-trace-"));
    try {
      writeFileSync(
        join(dir, "host.c"),
        `
        #include <stdbool.h>
        #include <stdio.h>
        extern bool __bpl_enter_stack_frame(void);
        extern void __bpl_enter_stack_frame_named(const char *,const char *,int);
        extern void __bpl_print_bpl_stack_trace(void);
        extern void __bpl_clear_frame_info(void);
        extern void __bpl_exit_stack_frame(void);
        static int enter(const char *name,int line) {
          if(__bpl_enter_stack_frame())return 1;
          __bpl_enter_stack_frame_named(name,"trace",line);return 0;
        }
        int main(void) {
          // No entered frame: recording/clearing/returning must not index -1.
          __bpl_enter_stack_frame_named("invalid","trace",0);
          __bpl_clear_frame_info();__bpl_exit_stack_frame();
          if(enter("outer",1)||enter("inner",2))return 1;
          fputs("A\\n",stderr);__bpl_print_bpl_stack_trace();
          __bpl_clear_frame_info();
          fputs("B\\n",stderr);__bpl_print_bpl_stack_trace();
          __bpl_exit_stack_frame();
          if(enter("replacement",3))return 2;
          fputs("C\\n",stderr);__bpl_print_bpl_stack_trace();
          __bpl_exit_stack_frame();__bpl_exit_stack_frame();
          fputs("D\\n",stderr);__bpl_print_bpl_stack_trace();
          if(enter("fresh",4))return 3;
          fputs("E\\n",stderr);__bpl_print_bpl_stack_trace();
          __bpl_exit_stack_frame();return 0;
        }
      `,
      );
      const built = spawnSync(
        process.env.CC || "clang",
        [
          "-O2",
          "-ffunction-sections",
          "-fdata-sections",
          resolve("lib/runtime_support.c"),
          join(dir, "host.c"),
          ...(process.platform === "linux"
            ? ["-Wl,--gc-sections", "-ldl"]
            : []),
          "-o",
          join(dir, "host"),
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      if (built.status !== 0)
        throw new Error(`${built.stdout}\n${built.stderr}`);
      const result = spawnSync(join(dir, "host"), [], {
        encoding: "utf8",
        timeout: 30000,
      });
      expect(result.status).toBe(0);
      const text = result.stderr.replace(/\x1b\[[0-9;]*m/g, "");
      const parts = text.split(/^[ABCDE]\n/m).slice(1);
      expect(parts).toHaveLength(5);
      expect(parts[0]).toContain("inner at trace:2");
      expect(parts[0]).toContain("outer at trace:1");
      expect(parts[0]!.indexOf("inner")).toBeLessThan(
        parts[0]!.indexOf("outer"),
      );
      expect(parts[1]).toContain("outer");
      expect(parts[1]).not.toContain("inner");
      expect(parts[2]).toContain("replacement at trace:3");
      expect(parts[2]).toContain("outer");
      expect(parts[3]).toBe("");
      expect(parts[4]).toContain("fresh at trace:4");
      expect(parts[4]).not.toContain("outer");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  60000,
);

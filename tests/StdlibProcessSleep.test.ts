import { test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { native } from "./helpers/webPackages";

test.skipIf(process.platform !== "linux")(
  "process.sleep widens milliseconds before scaling and reports failures",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-process-sleep-"));
    try {
      const shim = join(dir, "sleep.c");
      writeFileSync(
        shim,
        `#include <stdint.h>
static int64_t last;static int calls;static int failed;
int32_t __wrap___bpl_sleep_us(int64_t value){last=value;calls++;return failed?5:0;}
int64_t lastSleep(void){return last;}int sleepCalls(void){return calls;}
void failSleep(void){failed=1;}
`,
      );
      const source = `import sleep from "std/process.bpl";
extern lastSleep()ret long;extern sleepCalls()ret int;extern failSleep();
frame main()ret int{
 sleep(0);if(lastSleep()!=0){return 1;}
 sleep(2147483647);if(lastSleep()!=2147483647000){return 2;}
 sleep(3000000);if(lastSleep()!=3000000000){return 3;}
 local rejected:bool=false;try{sleep(-1);}catch{rejected=true;}
 if(!rejected||sleepCalls()!=3){return 4;}
 failSleep();rejected=false;try{sleep(1);}catch{rejected=true;}
 if(!rejected||sleepCalls()!=4){return 5;}return 0;
}`;
      for (const opt of [0, 3])
        native(source, [
          "-O",
          String(opt),
          "--clang-flag=-Wl,--wrap=__bpl_sleep_us",
          `--clang-flag=${shim}`,
        ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  60000,
);

import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

test("native clocks check failures and sleeps retry remaining time without int overflow", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-native-time-"));
  try {
    const source = join(dir, "test.c");
    writeFileSync(
      source,
      `#define _GNU_SOURCE
#include <time.h>
#include <errno.h>
#include <stdint.h>
#include <assert.h>
int fake_clock(clockid_t, struct timespec *);
int fake_sleep(const struct timespec *, struct timespec *);
#define clock_gettime fake_clock
#define nanosleep fake_sleep
#include "${resolve("lib/runtime_support.c")}" 
#undef clock_gettime
#undef nanosleep
int32_t __bpl_stack_depth = 0;
static int fail_clock, sleep_calls;
int fake_clock(clockid_t id, struct timespec *value) {
  if(fail_clock) {errno=EIO;return -1;}
  value->tv_sec=id==CLOCK_MONOTONIC?123:2200000000LL;
  value->tv_nsec=987654321;
  return 0;
}
int fake_sleep(const struct timespec *requested, struct timespec *remaining) {
  if(sleep_calls++==0) {
    assert(requested->tv_sec==3000 && requested->tv_nsec==123000);
    remaining->tv_sec=1;remaining->tv_nsec=456000;errno=EINTR;return -1;
  }
  assert(requested->tv_sec==1 && requested->tv_nsec==456000);return 0;
}
int main(void) {
 int64_t result=0;
 assert(__bpl_clock(0,1,&result)==0 && result==2200000000LL);
 assert(__bpl_clock(0,1000,&result)==0 && result==2200000000987LL);
 assert(__bpl_clock(0,1000000,&result)==0 && result==2200000000987654LL);
 assert(__bpl_clock(1,1000,&result)==0 && result==123987);
 fail_clock=1;assert(__bpl_clock(0,1,&result)==EIO && result==0);
 assert(__bpl_clock(0,3,&result)==EINVAL);
 assert(__bpl_sleep_us(-1)==EINVAL && sleep_calls==0);
 assert(__bpl_sleep_us(3000000123LL)==0 && sleep_calls==2);
 return 0;
}`,
    );
    for (const opt of [0, 3]) {
      const binary = join(dir, `native-${opt}`);
      const compilation = spawnSync(
        process.env.CC || "clang",
        [
          `-O${opt}`,
          source,
          "-o",
          binary,
          ...(process.platform === "linux" ? ["-ldl"] : []),
        ],
        { encoding: "utf8" },
      );
      expect(compilation.stderr).toBe("");
      expect(compilation.status).toBe(0);
      const run = spawnSync(binary, [], { encoding: "utf8" });
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

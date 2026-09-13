import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
const min = -(1n << 63n),
  max = (1n << 63n) - 1n;
const literal = (n: bigint) =>
  `cast<long>(0x${BigInt.asUintN(64, n).toString(16)})`;
const checks: string[] = [];
for (const [factory, scale] of [
  ["fromSeconds", 1000n],
  ["fromMinutes", 60000n],
  ["fromHours", 3600000n],
] as const) {
  for (const n of [min / scale, -1n, 0n, 1n, max / scale])
    checks.push(
      `d=Duration.${factory}(${literal(n)});if(d.milliseconds!=${literal(n * scale)}) {throw "wrong scale";}`,
    );
  for (const n of [min / scale - 1n, max / scale + 1n, min, max])
    checks.push(
      `caught=false;try {d=Duration.${factory}(${literal(n)});}catch(e:string) {caught=true;}if(!caught) {throw "missing scale overflow";}`,
    );
}
for (const a of [min, min + 1n, -1n, 0n, 1n, max - 1n, max])
  for (const b of [min, -1n, 0n, 1n, max])
    for (const op of ["+", "-"]) {
      const value = op === "+" ? a + b : a - b;
      checks.push(
        `a=Duration.fromMs(${literal(a)});b=Duration.fromMs(${literal(b)});`,
      );
      checks.push(
        value < min || value > max
          ? `caught=false;try {d=a${op}b;}catch(e:string) {caught=true;}if(!caught) {throw "missing arithmetic overflow";}`
          : `d=a${op}b;if(d.milliseconds!=${literal(value)}) {throw "wrong arithmetic";}`,
      );
    }
test("checked durations and monotonic stopwatch", () => {
  expectCorrectnessSuite([
    {
      name: "checked-time",
      validateLlvm: true,
      source: `import [Time], [Duration], [Stopwatch] from "std/time.bpl"; import printf from "std/c.bpl";
frame main() ret int {
local a:Duration;local b:Duration;local d:Duration;local caught:bool=false;
${checks.join("\n")}
d=Duration.fromMs(-1999);if(d.toSeconds()!=-1) {return 1;}
local before:long=Time.nowSeconds();local us:long=Time.nowUs();local ms:long=Time.nowMs();local after:long=Time.nowSeconds();
if(us/1000000<before || ms/1000>after || us/1000>ms) {return 2;}
local sw:Stopwatch=Stopwatch.new();if(sw.elapsedMs()!=0) {return 3;}
sw.start();Time.sleep(5);d=sw.stop();if(d.milliseconds<5 || sw.elapsedMs()!=d.milliseconds) {return 4;}
Time.sleepUs(1000);if(sw.stop().milliseconds!=d.milliseconds) {return 5;}
sw.reset();if(sw.elapsedMs()!=0) {return 6;}sw.restart();Time.sleepUs(1000);if(sw.elapsedMs()<1) {return 7;}
if(Time.measure(|| {Time.sleep(2);})<2) {return 8;}
Time.sleep(0);Time.sleepUs(0);Time.sleepSeconds(0);
${["Time.sleep(-1)", "Time.sleepUs(-1)", "Time.sleepSeconds(-1)", `Time.sleep(${literal(max)})`, `Time.sleepSeconds(${literal(max)})`].map((call) => `caught=false;try {${call};}catch(e:string) {caught=true;}if(!caught) {return 9;}`).join("\n")}
printf("checked time passed\\n");return 0;
}`,
      expectedStdout: "checked time passed\n",
    },
  ]);
}, 60000);

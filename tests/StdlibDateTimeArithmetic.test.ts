import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Independent Jan-1 epoch-day counts: 365 days per year plus Gregorian leap
// counts through year-1, relative to 1970. BigInt preserves every second.
const first = -67768100567971200n;
const last = 67767976233532799n;
const long = (value: bigint) =>
  `cast<long>(0x${BigInt.asUintN(64, value).toString(16)})`;
const units = [
  ["addSeconds", 1n],
  ["addMinutes", 60n],
  ["addHours", 3600n],
  ["addDays", 86400n],
] as const;
const checks: string[] = [];
for (const [method, unit] of units) {
  for (const timestamp of [
    first,
    first + unit - 1n,
    -1n,
    0n,
    1n,
    last - unit + 1n,
    last,
  ]) {
    const minimum = (first - timestamp) / unit;
    const maximum = (last - timestamp) / unit;
    checks.push(`original=DateTime.fromTimestamp(${long(timestamp)});`);
    for (const amount of [minimum, 0n, maximum]) {
      checks.push(
        `result=original.${method}(${long(amount)});if(result.toTimestamp()!=${long(timestamp + amount * unit)} || original.toTimestamp()!=${long(timestamp)}) {throw "wrong checked offset";}`,
      );
    }
    for (const amount of [
      minimum - 1n,
      maximum + 1n,
      -(1n << 63n),
      (1n << 63n) - 1n,
      1n << 62n,
    ]) {
      checks.push(
        `caught=false;try {result=original.${method}(${long(amount)});} catch(e:string) {caught=true;}if(!caught || original.toTimestamp()!=${long(timestamp)}) {throw "missing offset error";}`,
      );
    }
  }
}

test("DateTime arithmetic checks unit scaling, inclusive boundaries, and calendar offsets", () => {
  expectCorrectnessSuite([
    {
      name: "datetime-arithmetic",
      validateLlvm: true,
      source: `import [DateTime] from "std/date.bpl"; import printf from "std/c.bpl";
frame main() ret int {
    local original:DateTime=DateTime.new(1970,1,1,0,0,0);
    local result:DateTime=original;local caught:bool=false;
    ${checks.join("\n")}
    original=DateTime.new(0,1,31,12,34,56);result=original.addMonths(-1);
    if(result.year!=-1 || result.month!=12 || result.day!=31 || result.hour!=12 || result.minute!=34 || result.second!=56) {return 1;}
    result=original.addMonths(1);if(result.year!=0 || result.month!=2 || result.day!=29) {return 2;}
    original=DateTime.new(2000,2,29,23,59,59);result=original.addYears(100);
    if(result.year!=2100 || result.day!=28 || result.hour!=23 || result.minute!=59 || result.second!=59) {return 3;}
    result=original.addYears(-2000);if(result.year!=0 || result.day!=29 || result.second!=59) {return 4;}
    if(original.year!=2000 || original.month!=2 || original.day!=29) {return 5;}
    local low:DateTime=DateTime.fromTimestamp(${long(first)});local high:DateTime=DateTime.fromTimestamp(${long(last)});
    if(high.diffSeconds(&low)!=${long(last - first)} || low.diffSeconds(&high)!=${long(first - last)}) {return 6;}
    ${["low.addMonths(-1)", "high.addMonths(1)", "low.addYears(-1)", "high.addYears(1)"].map((call) => `caught=false;try {result=${call};} catch(e:string) {caught=true;}if(!caught) {throw "missing calendar range error";}`).join("\n")}
    original=DateTime.new(2000,2,29,24,0,0);
    ${[...units.map(([method]) => method), "addMonths", "addYears"].map((method) => `caught=false;try {result=original.${method}(0);} catch(e:string) {caught=true;}if(!caught) {throw "accepted invalid clock";}`).join("\n")}
    printf("DateTime arithmetic passed\\n");return 0;
}`,
      expectedStdout: "DateTime arithmetic passed\n",
    },
  ]);
}, 60000);

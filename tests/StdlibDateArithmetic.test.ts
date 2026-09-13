import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const checks: string[] = [];
for (const year of [-401, -400, -1, 0, 1, 1900, 2000, 2024]) {
  for (const offset of [-25, -13, -12, -1, 0, 1, 12, 13, 25]) {
    const target = new Date(0);
    target.setUTCFullYear(year, offset, 1);
    const end = new Date(target);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    checks.push(
      `checkMonths(${year},1,31,${offset},${target.getUTCFullYear()},${target.getUTCMonth() + 1},${Math.min(31, end.getUTCDate())});`,
    );
  }
}
const failures = [
  "low.addDays(-1)",
  "high.addDays(1)",
  "low.subDays(1)",
  "high.subDays(-1)",
  "low.addMonths(-1)",
  "high.addMonths(1)",
  "low.addYears(-1)",
  "high.addYears(1)",
  "low.addYears(cast<int>(0x80000000))",
  "high.addYears(2147483647)",
  "bad.addMonths(0)",
  "bad.addYears(0)",
  "bad.addDays(0)",
  "bad.subDays(0)",
];
test("Date arithmetic normalizes negative months and rejects overflow without narrowing", () => {
  expectCorrectnessSuite([
    {
      name: "date-arithmetic",
      validateLlvm: true,
      source: `import [Date] from "std/date.bpl"; import printf from "std/c.bpl";
frame checkMonths(y:int,m:int,d:int,offset:int,ey:int,em:int,ed:int) {
    local original:Date=Date.new(y,m,d);local result:Date=original.addMonths(offset);
    if(result.year!=ey || result.month!=em || result.day!=ed || original.year!=y || original.month!=m || original.day!=d) {throw "wrong month arithmetic";}
}
frame main() ret int {
    ${checks.join("\n")}
    checkMonths(0,1,31,-1,-1,12,31);
    checkMonths(2147483647,1,31,0,2147483647,1,31);
    checkMonths(cast<int>(0x80000000),1,31,0,cast<int>(0x80000000),1,31);
    checkMonths(0,1,31,2147483647,178956970,8,31);
    checkMonths(0,1,31,cast<int>(0x80000000),-178956971,5,31);
    local leap:Date=Date.new(2000,2,29);local next:Date=leap.addYears(100);
    if(next.year!=2100 || next.month!=2 || next.day!=28) {return 1;}
    next=leap.addYears(-2000);if(next.year!=0 || next.day!=29) {return 2;}
    local epoch:Date=Date.new(1970,1,1);
    local forward:Date=epoch.subDays(cast<int>(0x80000000));
    local backward:Date=epoch.addDays(cast<int>(0x80000000));
    if(forward.diffDaysLong(&epoch)!=cast<long>(2147483648) || backward.diffDays(&epoch)!=cast<int>(0x80000000)) {return 3;}
    local near:Date=epoch.addDays(2147483647);if(near.diffDays(&epoch)!=2147483647) {return 4;}
    local low:Date=Date.new(cast<int>(0x80000000),1,1);
    local high:Date=Date.new(2147483647,12,31);
    if(high.diffDaysLong(&low)!=cast<long>(1568704592609) || low.diffDaysLong(&high)!=cast<long>(-1568704592609)) {return 5;}
    local bad:Date=Date.new(2023,2,29);local caught:bool=false;
    ${failures.map((call) => `caught=false;try {local result:Date=${call};printf("Unexpected year %d\\n",result.year);} catch(e:string) {caught=true;}if(!caught) {throw "missing date error";}`).join("\n")}
    ${["forward.diffDays(&epoch)", "epoch.diffDays(&backward)", "high.diffDays(&low)", "low.diffDays(&high)", "bad.diffDaysLong(&epoch)", "epoch.diffDaysLong(&bad)"].map((call) => `caught=false;try {printf("Unexpected difference %ld\\n",cast<long>(${call}));} catch(e:string) {caught=true;}if(!caught) {throw "missing difference error";}`).join("\n")}
    printf("Date arithmetic passed\\n");return 0;
}`,
      expectedStdout: "Date arithmetic passed\n",
    },
  ]);
}, 60000);

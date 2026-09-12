import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// JavaScript UTC dates provide an independent oracle, including astronomical
// year zero. setUTCFullYear avoids Date.UTC's special handling of years 0..99.
const timestamps = [-86401, -86400, -86399, -3601, -60, -1, 0, 1, 86399];
for (const year of [
  -10000, -800, -400, -100, -1, 0, 1, 99, 400, 1600, 1900, 1968, 2000, 2100,
  2400, 10000,
]) {
  for (const month of [0, 1, 2, 11]) {
    const date = new Date(0);
    date.setUTCFullYear(year, month, 28);
    date.setUTCHours(23, 59, 59, 0);
    timestamps.push(date.getTime() / 1000);
  }
}
const checks = timestamps
  .map((timestamp) => {
    const date = new Date(timestamp * 1000);
    return `check(${timestamp}, ${date.getUTCFullYear()}, ${date.getUTCMonth() + 1}, ${date.getUTCDate()}, ${date.getUTCHours()}, ${date.getUTCMinutes()}, ${date.getUTCSeconds()});`;
  })
  .join("\n");

test("Date and DateTime convert pre-epoch timestamps, full Gregorian cycles, and int year boundaries", () => {
  expectCorrectnessSuite([
    {
      name: "date-timestamps",
      validateLlvm: true,
      source: `import [Date], [DateTime] from "std/date.bpl";
import printf from "std/c.bpl";
frame check(ts:long,y:int,m:int,d:int,h:int,min:int,s:int) {
    local date:Date=Date.fromTimestamp(ts);
    local dt:DateTime=DateTime.fromTimestamp(ts);
    if(!date.isValid() || date.year!=y || date.month!=m || date.day!=d) {throw "wrong date";}
    if(!dt.isValid() || dt.year!=y || dt.month!=m || dt.day!=d || dt.hour!=h || dt.minute!=min || dt.second!=s) {throw "wrong datetime";}
    if(dt.toTimestamp()!=ts || date.toTimestamp()!=ts-cast<long>(h*3600+min*60+s)) {throw "wrong timestamp";}
}
frame rejected(ts:long) {
    local caught:bool=false;
    try { local d:Date=Date.fromTimestamp(ts); printf("Unexpected date: %d\\n",d.year); }
    catch(e:string) {caught=true;}
    if(!caught) {throw "missing range error";}
}
frame main() ret int {
    ${checks}
    # Walk every day of a complete 400-year cycle, across year zero.
    # Expected fields advance independently using month lengths.
    local y:int=-200; local m:int=1; local d:int=1;
    local ts:long=-68478566400;
    local lengths:int[12]=[31,28,31,30,31,30,31,31,30,31,30,31];
    loop(local i:int=0;i<146097;i=i+1) {
        check(ts,y,m,d,0,0,0);
        check(ts+86399,y,m,d,23,59,59);
        local dim:int=lengths[m-1];
        if(m==2 && y%4==0 && (y%100!=0 || y%400==0)) {dim=29;}
        d=d+1;
        if(d>dim) {d=1;m=m+1;}
        if(m>12) {m=1;y=y+1;}
        ts=ts+86400;
    }
    if(y!=200 || m!=1 || d!=1) {return 1;}
    local low:DateTime=DateTime.new(cast<int>(0x80000000),1,1,0,0,0);
    local high:DateTime=DateTime.new(2147483647,12,31,23,59,59);
    check(low.toTimestamp(),low.year,1,1,0,0,0);
    check(high.toTimestamp(),high.year,12,31,23,59,59);
    rejected(low.toTimestamp()-1); rejected(high.toTimestamp()+1);
    rejected(cast<long>(0x8000000000000000)); rejected(cast<long>(0x7fffffffffffffff));
    local bad:Date=Date.new(1900,2,29); local caught:bool=false;
    try {printf("Unexpected timestamp: %ld\\n",bad.toTimestamp());} catch(e:string) {caught=true;}
    if(!caught) {return 2;}
    local badTime:DateTime=DateTime.new(2000,2,29,24,0,0); caught=false;
    try {printf("Unexpected timestamp: %ld\\n",badTime.toTimestamp());} catch(e:string) {caught=true;}
    if(!caught) {return 3;}
    local epoch:Date=Date.new(1970,1,1); local prev:Date=epoch.subDays(1);
    if(prev.year!=1969 || prev.month!=12 || prev.day!=31 || epoch.diffDays(&prev)!=1) {return 4;}
    printf("Date timestamps passed\\n");return 0;
}`,
      expectedStdout: "Date timestamps passed\n",
    },
  ]);
}, 60000);

import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

// Find the Thursday of the ISO week, then count from that year's January 1.
function isoWeek(date: Date): number {
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const start = utcDate(thursday.getUTCFullYear(), 1, 1);
  return Math.ceil(((thursday.getTime() - start.getTime()) / 86400000 + 1) / 7);
}
const cases = [
  -800, -401, -400, -1, 0, 1, 4, 99, 100, 400, 1900, 1969, 1970, 2000, 2004,
  2009, 2015, 2016, 2020, 2021, 2024, 2100,
].flatMap((year) =>
  [1, 2, 3, 4, 5, 6, 7, 358, 359, 360, 361, 362, 363, 364, 365, 366].map(
    (day) => utcDate(year, 1, day),
  ),
);
const checks = cases
  .map(
    (date) =>
      `check(${date.getUTCFullYear()},${date.getUTCMonth() + 1},${date.getUTCDate()},${date.getUTCDay()},${isoWeek(date)});`,
  )
  .join("\n");

test("Date weekdays and ISO weeks handle week 53, adjacent years, and negative years", () => {
  expectCorrectnessSuite([
    {
      name: "date-iso-weeks",
      validateLlvm: true,
      source: `import [Date] from "std/date.bpl"; import printf from "std/c.bpl";
frame check(y:int,m:int,d:int,dow:int,week:int) {
    local date:Date=Date.new(y,m,d);
    if(date.dayOfWeek()!=dow || date.weekOfYear()!=week) {
        printf("Mismatch %d-%d-%d: weekday %d, week %d\\n",y,m,d,date.dayOfWeek(),date.weekOfYear());
        throw "calendar week mismatch";
    }
}
frame main() ret int {
    ${checks}
    # Gregorian weekdays repeat every 400 years. Compare int boundaries
    # against equivalent years that the independent JS oracle supports.
    ${[-2147483648, 2147483647]
      .map((year) => {
        const equivalent = ((year % 400) + 400) % 400;
        return [1, 4, 365]
          .map((day) => {
            const date = utcDate(equivalent, 1, day);
            return `check(${year === -2147483648 ? "cast<int>(0x80000000)" : year},${date.getUTCMonth() + 1},${date.getUTCDate()},${date.getUTCDay()},${isoWeek(date)});`;
          })
          .join("\n");
      })
      .join("\n")}
    local invalid:Date=Date.new(2000,13,1); local caught:bool=false;
    try {printf("Unexpected week %d\\n",invalid.weekOfYear());} catch(e:string) {caught=true;}
    if(!caught) {return 1;}
    printf("Date weeks passed\\n");return 0;
}`,
      expectedStdout: "Date weeks passed\n",
    },
  ]);
}, 60000);

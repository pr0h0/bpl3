import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

export const dateFormattingSource = `import [Date], [DateTime] from "std/date.bpl";
import [Time] from "std/time.bpl";
import printf, free from "std/c.bpl";
frame show(s:string) {printf("%s\\n",s);free(cast<*void>(s));}
frame main() ret int {
    local low:int=cast<int>(0x80000000);
    local d:Date=Date.new(low,12,31);
    show(d.format());show(d.formatSep(cast<u8>('/')));
    d=Date.new(low,low,low);show(d.format());show(d.formatSep(cast<u8>(0)));
    local dt:DateTime=DateTime.new(low,low,low,low,low,low);
    show(dt.format());show(dt.formatISO());show(dt.formatTime());
    dt=DateTime.new(2147483647,12,31,23,59,59);
    show(dt.formatISO());show(Time.formatTimestamp(dt.toTimestamp()));
    show(Time.formatTimestamp(-1));show(Time.formatTimestamp(-86401));
    dt=DateTime.new(0,2,29,1,2,3);show(Time.formatTimestamp(dt.toTimestamp()));
    local caught:bool=false;
    try {show(Time.formatTimestamp(cast<long>(0x7fffffffffffffff)));} catch(e:string) {caught=true;}
    if(!caught) {return 1;}
    loop(local i:int=0;i<1000;i=i+1) {
        local text:string=d.formatSep(cast<u8>('/'));free(cast<*void>(text));
    }
    return 0;
}`;
export const dateFormattingOutput =
  [
    "-2147483648-12-31",
    "-2147483648/12/31",
    "-2147483648--2147483648--2147483648",
    "-2147483648-2147483648-2147483648",
    "-2147483648--2147483648--2147483648 -2147483648:-2147483648:-2147483648",
    "-2147483648--2147483648--2147483648T-2147483648:-2147483648:-2147483648",
    "-2147483648:-2147483648:-2147483648",
    "2147483647-12-31T23:59:59",
    "2147483647-12-31 23:59:59",
    "1969-12-31 23:59:59",
    "1969-12-30 23:59:59",
    "0000-02-29 01:02:03",
  ].join("\n") + "\n";

test("Date formatting handles all stored int fields and Time formats pre-epoch UTC seconds", () => {
  expectCorrectnessSuite([
    {
      name: "date-formatting",
      source: dateFormattingSource,
      expectedStdout: dateFormattingOutput,
      validateLlvm: true,
    },
  ]);
}, 60000);

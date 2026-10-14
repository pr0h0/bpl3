import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("factories initialize vtables for structs declared after their callers", () => {
  for (const opt of [0, 3]) {
    native(
      `
      struct Factory {
        frame make() ret Later {local value:Later;value.number=42;return value;}
        frame literal() ret Later {return Later {number: 43};}
      }
      struct Later {number:int,frame get(this:*Later) ret int {return this.number;}}
      frame main() ret int {
        local first:Later=Factory.make();if(first.get()!=42){return 1;}
        local second:Later=Factory.literal();if(second.get()!=43){return 2;}
        return 0;
      }
    `,
      ["-O", String(opt)],
    );
  }
}, 90000);

test("array literals convert compatible integers to their element width", () => {
  for (const opt of [0, 3]) {
    native(
      `
      frame main() ret int {
        local chars:char[4]=['a',0,255,127];
        if(chars[0]!='a'||chars[1]!=0||cast<u8>(chars[2])!=255||chars[3]!=127){return 1;}
        local values:short[3]=[cast<short>(-1),2,300];
        if(values[0]!=-1||values[1]!=2||values[2]!=300){return 2;}
        local wide:long[3]=[cast<long>(2147483648),-1,2];
        if(wide[0]!=2147483648||wide[1]!=-1||wide[2]!=2){return 3;}
        local nested:char[2][2]=[['a',0],['b',0]];
        if(nested[0][1]!=0||nested[1][0]!='b'){return 4;}
        return 0;
      }
    `,
      ["-O", String(opt)],
    );
  }
}, 90000);

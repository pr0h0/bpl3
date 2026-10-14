import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("factories initialize vtables for structs declared after their callers", () => {
  for (const opt of [0, 3]) {
    native(`
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
    `, ["-O", String(opt)]);
  }
}, 90000);

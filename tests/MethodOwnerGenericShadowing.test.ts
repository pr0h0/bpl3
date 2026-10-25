import { test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, prefix, receiver, extra, body] of [
  ["pointer method", "type T=string;", "*Box<T>", "", "return box.read(0)-7;"],
  ["value method", "type T=string;", "Box<T>", "", "return box.read(0)-7;"],
  [
    "bound method",
    "type T=string;",
    "*Box<T>",
    "",
    "local read:Lambda<int>(int)=box.read;return read(0)-7;",
  ],
  [
    "static method",
    "type T=string;",
    "*Box<T>",
    "",
    "return Box<int>.identity(7)-7;",
  ],
  [
    "overloaded method",
    "type T=string;",
    "*Box<T>",
    "frame read(this:*Box<T>,index:string)ret T{index;this.seen=2;return this.value;}",
    'local first:int=box.read(0);if(box.seen!=1)return 1;local second:int=box.read("key");if(box.seen!=2)return 2;return first+second-14;',
  ],
  ["unshadowed instance control", "", "*Box<T>", "", "return box.read(0)-7;"],
  [
    "unshadowed static control",
    "",
    "*Box<T>",
    "",
    "return Box<int>.identity(7)-7;",
  ],
  [
    "bound value method",
    "type T=string;",
    "Box<T>",
    "",
    "local read:Lambda<int>(int)=box.read;local result:int=read(0);if(box.seen!=0)return 1;return result-7;",
  ],
  [
    "generic binding",
    "",
    "*Box<T>",
    "",
    "local read:Lambda<int>(int)=box.read;return read(0)-7;",
  ],
  [
    "distinct bound instantiations",
    "type T=string;",
    "*Box<T>",
    "",
    "local second:Box<long>=Box<long>{value:9,seen:0};local readA:Lambda<int>(int)=box.read;local readB:Lambda<long>(int)=second.read;if(readA(0)!=7 || readB(0)!=9 || box.seen!=1 || second.seen!=1)return 1;return 0;",
  ],
  [
    "generic binding factory",
    "type T=string;",
    "*Box<T>",
    "",
    "local read:Lambda<int>(int)=bind<int>(&box);local result:int=read(0);if(box.seen!=1)return 1;return result-7;",
  ],
] as const) {
  test(`imported method signatures preserve owner generics for ${name}`, () => {
    const root = mkdtempSync(join(tmpdir(), "bpl-method-generic-shadow-"));
    try {
      const file = join(root, "box.bpl");
      writeFileSync(
        file,
        `${prefix}struct Box<T>{value:T,seen:int,
    frame read(this:${receiver},index:int)ret T{index;this.seen=1;return this.value;}
    frame identity(value:T)ret T{return value;}${extra}}
    export Box;`,
      );
      const factory =
        name === "generic binding factory"
          ? "frame bind<A>(box:*Box<A>)ret Lambda<A>(int){return box.read;}"
          : "";
      expectCorrectnessSuite([
        {
          name: name.replaceAll(" ", "-"),
          validateLlvm: true,
          source: `import [Box] from ${JSON.stringify(file)};${factory}
     frame main()ret int{local box:Box<int>=Box<int>{value:7,seen:0};box;${body}}`,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
}

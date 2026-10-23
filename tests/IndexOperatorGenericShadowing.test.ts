import { test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, prefix, keyType, extra, body] of [
  ["generic getter", "type T=string;", "int", "", "return box[0]-7;"],
  ["generic setter", "type T=string;", "int", "", "box[0]=9;return box[0]-9;"],
  [
    "generic caller",
    "type T=string;type Key=long;",
    "Key",
    "frame read<A>(box:*Box<A>)ret A{return (*box)[0];}",
    "return read<int>(&box)-7;",
  ],
  [
    "alias lexical scope",
    "type T=string;type Key=T;",
    "Key",
    "",
    'return box["key"]-7;',
  ],
  ["unshadowed control", "", "int", "", "return box[0]-7;"],
] as const) {
  test(`index signatures preserve owner parameters for ${name}`, () => {
    const root = mkdtempSync(join(tmpdir(), "bpl-index-generic-shadow-"));
    try {
      const file = join(root, "box.bpl");
      writeFileSync(
        file,
        `${prefix}struct Box<T>{value:T,
    frame __get__(this:*Box<T>,index:${keyType})ret T{index;return this.value;}
    frame __set__(this:*Box<T>,index:${keyType},value:T){index;this.value=value;}}
    export Box;`,
      );
      expectCorrectnessSuite([
        {
          name: name.replaceAll(" ", "-"),
          validateLlvm: true,
          source: `import [Box] from ${JSON.stringify(file)};${extra}
     frame main()ret int{local box:Box<int>=Box<int>{value:7};${body}}`,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
}

import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, declaration, setup, expression] of [
  [
    "private integer alias",
    `type Key=long;struct Box{value:int,frame __get__(this:*Box,index:Key)ret int{return this.value+cast<int>(index);}}`,
    "local box:Box=Box{value:8};",
    "box[-1]",
  ],
  [
    "caller alias collision",
    `type Key=long;struct Box{value:int,frame __get__(this:*Box,index:Key)ret int{return this.value+cast<int>(index);}}`,
    "local box:Box=Box{value:8};",
    "box[-1]",
  ],
  [
    "private generic alias",
    `type Key=long;struct Box<T>{value:T,frame __get__(this:*Box<T>,index:Key)ret T{index;return this.value;}}`,
    "local box:Box<int>=Box<int>{value:7};",
    "box[0]",
  ],
  [
    "private pointer alias",
    `type Key=*int;struct Box{value:int,frame __get__(this:*Box,index:Key)ret int{*index=*index+1;return this.value+*index;}}`,
    "local box:Box=Box{value:3};local key:int=3;",
    "box[key]",
  ],
  [
    "generic receiver alias",
    `type Key=long;struct Box<T>{value:T,frame __get__(this:*Box<T>,index:Key)ret T{index;return this.value;}}`,
    "local box:Alias<int>=Box<int>{value:7};",
    "box[0]",
  ],
  [
    "read and write private aliases",
    `type Key=long;struct Box{value:int,
      frame __get__(this:*Box,index:Key)ret int{return this.value+cast<int>(index);}
      frame __set__(this:*Box,index:Key,value:Key){this.value=cast<int>(index+value);}}`,
    "local box:Box=Box{value:0};box[-1]=7;",
    "box[1]",
  ],
] as const) {
  test(`imported getters resolve ${name} in the declaring module`, () => {
    const root = mkdtempSync(join(tmpdir(), "bpl-getter-module-"));
    try {
      const module = join(root, "box.bpl");
      writeFileSync(module, `${declaration}\nexport Box;`);
      const callerAlias =
        name === "caller alias collision"
          ? "type Key=string;"
          : name === "generic receiver alias"
            ? "type Alias<U>=Box<U>;"
            : "";
      expectCorrectnessSuite([
        {
          name: name.replaceAll(" ", "-"),
          validateLlvm: true,
          source: `import [Box] from ${JSON.stringify(module)};${callerAlias}
      frame main()ret int{${setup}return ${expression}-7;}`,
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
}

test("caller aliases cannot authorize incompatible imported getter arguments", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-getter-collision-"));
  try {
    const file = join(root, "box.bpl");
    writeFileSync(
      file,
      `type Key=long;struct Box{frame __get__(this:*Box,index:Key)ret int{return cast<int>(index);}}export Box;`,
    );
    const source = `import [Box] from ${JSON.stringify(file)};type Key=string;
      frame main(){local box:Box=Box{};box["wrong"];}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, join(root, "main.bpl")).parse());
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_INDEX_TARGET_NOT_INDEXABLE"),
    ).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

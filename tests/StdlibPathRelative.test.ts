import { test } from "bun:test";
import { posix } from "node:path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("relative paths compare normalized components and construct parent traversals", () => {
  const paths = [
    "/",
    "/a",
    "/a/b",
    "/a/b/..",
    "/abc",
    "/a/bc",
    "/a//c/",
    "/a/../../b",
    "/café/文件",
    "/.hidden",
  ];
  const pairs: [string, string, string][] = [];
  for (const source of paths) {
    for (const target of paths)
      pairs.push([source, target, posix.relative(source, target)]);
  }
  pairs.push(
    ["a/b", "a/c", "../c"],
    ["", "a", "a"],
    ["a", "", ".."],
    [".", ".", ""],
    ["../a", "../b", "../b"],
    ["a", "../b", "../../b"],
    ["../..", "../../a", "a"],
  );
  const invalid: [string, string][] = [
    ["/a", "a"],
    ["a", "/a"],
    ["../a", "b"],
    ["../..", "../a"],
  ];
  expectCorrectnessSuite([
    {
      name: "path-relative-oracle",
      validateLlvm: true,
      source: `import [Path] from "std/path.bpl";import [String] from "std/string.bpl";
extern strcmp(a:string,b:string) ret int;extern printf(format:string,...) ret int;
frame verify(value:String,expected:string) {
 local equal:bool=strcmp(value.data,expected)==0;
 if(!equal) {printf("Expected [%s], got [%s]\\n",expected,value.data);}
 value.destroy();if(!equal) {throw "Incorrect relative path";}
}
frame main() ret int {
 ${pairs.map(([a, b, expected]) => `verify(Path.relative(${JSON.stringify(a)},${JSON.stringify(b)}),${JSON.stringify(expected)});`).join("\n")}
 local caught:bool=false;
 ${[...invalid.map(([a, b]) => `Path.relative(${JSON.stringify(a)},${JSON.stringify(b)})`), 'Path.relative(nullptr,"a")', 'Path.relative("a",nullptr)'].map((call) => `caught=false;try {local value:String=${call};value.destroy();}catch(error:string) {caught=error!=nullptr;}if(!caught) {return 1;}`).join("\n")}
 return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

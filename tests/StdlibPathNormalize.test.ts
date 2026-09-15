import { test } from "bun:test";
import { posix } from "node:path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("path normalization matches a seeded lexical oracle and preserves relative parents", () => {
  const paths = [
    "",
    "/",
    "///",
    ".",
    "..",
    "a/..",
    "/../../a",
    "../../a/../b",
    "a/.../.hidden/",
    "café/../文件",
    "a\\b/../c",
  ];
  let seed = 0x315316;
  const parts = ["a", "b", ".", "..", "", "c.d", ".hidden", "..."];
  for (let i = 0; i < 160; i++) {
    let path = i % 2 === 0 ? "/" : "";
    for (let j = 0; j < 7; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      path += `${parts[seed >>> 29]}/`;
    }
    paths.push(path);
  }
  // BPL deliberately drops trailing separators, preserving its existing
  // normalize contract; Node's POSIX implementation supplies other semantics.
  const checks = paths.map((path) => {
    const expected = posix.normalize(path).replace(/\/$/, "") || "/";
    return `verify(Path.normalize(${JSON.stringify(path)}),${JSON.stringify(expected)});`;
  });
  expectCorrectnessSuite([
    {
      name: "path-normalize-oracle",
      validateLlvm: true,
      source: `import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
extern strcmp(a:string,b:string) ret int;extern printf(format:string,...) ret int;
frame verify(value:String,expected:string) {
 local equal:bool=strcmp(value.data,expected)==0;
 if(!equal) {printf("Expected [%s], got [%s]\\n",expected,value.data);}
 value.destroy();if(!equal) {throw "Incorrect normalized path";}
}
frame main() ret int {
 ${checks.join("\n")}
 verify(Path.resolve("", "file"),"file");
 verify(Path.resolve("base/dir", "../file"),"base/file");
 verify(Path.resolve("base/dir", "/absolute/../file"),"/file");
 local caught:bool=false;
 try {local value:String=Path.normalize(nullptr);value.destroy();}catch(error:string) {caught=error!=nullptr;}
 if(!caught) {return 1;}
 caught=false;try {local value:String=Path.resolve(nullptr,"/file");value.destroy();}catch(error:string) {caught=error!=nullptr;}
 if(!caught) {return 2;}return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

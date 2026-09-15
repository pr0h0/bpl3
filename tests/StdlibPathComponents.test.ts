import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("path components handle empty paths, roots, separator boundaries, and dotfiles", () => {
  const unary: [string, string, string][] = [
    ["basename", "", ""],
    ["basename", "/", ""],
    ["basename", "///", ""],
    ["basename", "/a/b///", "b"],
    ["basename", "café/文件.txt/", "文件.txt"],
    ["basename", "a\\b", "a\\b"],
    ["dirname", "", "."],
    ["dirname", "/", "/"],
    ["dirname", "///", "/"],
    ["dirname", "a/", "."],
    ["dirname", "/a/b///", "/a"],
    ["dirname", "a///b", "a"],
    ["dirname", "a//b/c", "a//b"],
    ["dirname", "//a", "/"],
    ["dirname", "..", "."],
    ["extname", "", ""],
    ["extname", "/", ""],
    ["extname", ".", ""],
    ["extname", "..", ""],
    ["extname", "...", "."],
    ["extname", ".profile", ""],
    ["extname", ".profile.json", ".json"],
    ["extname", "/a.b/file", ""],
    ["extname", "archive.tar.gz///", ".gz"],
    ["extname", "name.", "."],
  ];
  const joins: [string, string, string][] = [
    ["", "file.txt", "file.txt"],
    ["", "", "."],
    ["a", "", "a"],
    ["a/", "", "a/"],
    ["", "/a", "/a"],
    ["/", "b", "/b"],
    ["///", "/b", "/b"],
    ["a///", "///b", "a/b"],
    ["a", "/", "a/"],
    ["/a", "/b", "/a/b"],
    ["a", "../b", "a/../b"],
    ["café", "文件.txt", "café/文件.txt"],
  ];
  const checks = [
    ...unary.map(
      ([method, input, expected]) =>
        `verify(Path.${method}(${JSON.stringify(input)}),${JSON.stringify(expected)});`,
    ),
    ...joins.map(
      ([a, b, expected]) =>
        `verify(Path.join(${JSON.stringify(a)},${JSON.stringify(b)}),${JSON.stringify(expected)});`,
    ),
  ];
  const invalid = [
    "Path.basename(nullptr)",
    "Path.dirname(nullptr)",
    "Path.extname(nullptr)",
    'Path.join(nullptr,"a")',
    'Path.join("a",nullptr)',
  ];
  expectCorrectnessSuite([
    {
      name: "path-components",
      validateLlvm: true,
      source: `import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
extern strcmp(a:string,b:string) ret int;
extern printf(format:string,...) ret int;
frame verify(value:String,expected:string) {
 local equal:bool=strcmp(value.data,expected)==0;
 if(!equal) {printf("Expected [%s], got [%s]\\n",expected,value.data);}
 value.destroy();if(!equal) {throw "Incorrect path";}
}
frame main() ret int {
 ${checks.join("\n")}
 if(Path.isAbsolute(nullptr) || Path.isAbsolute("") || Path.isAbsolute("a")) {return 1;}
 if(!Path.isAbsolute("/") || !Path.isAbsolute("/a")) {return 2;}
 local caught:bool=false;
 ${invalid.map((call) => `caught=false;try {local value:String=${call};value.destroy();}catch(error:string) {caught=strcmp(error,"Path cannot be null")==0;}if(!caught) {return 3;}`).join("\n")}
 return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

import { test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("checked directory listings own complete names and distinguish failures from empty directories", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-directory-"));
  try {
    const names = [
      ".hidden",
      "..prefix",
      "with spaces",
      "café",
      "x".repeat(240),
    ];
    for (let i = 0; i < 40; i++) names.push(`entry-${i}`);
    for (const name of names) writeFileSync(join(dir, name), "");
    mkdirSync(join(dir, "empty"));
    names.push("empty");
    expectCorrectnessSuite([
      {
        name: "checked-directory-listing",
        validateLlvm: true,
        source: `import [FS] from "std/fs.bpl";
import [String] from "std/string.bpl"; import [Array] from "std/array.bpl";
import [IOError] from "std/errors.bpl";
extern strcmp(a:string,b:string) ret int;
frame main() ret int {
 local names:Array<String>=FS.listDirChecked("${dir}");
 if(names.length!=${names.length}) {return 1;}
 local expected:string[${names.length}]=[${names.map((name) => JSON.stringify(name)).join(",")}];
 loop(local i:int=0;i<${names.length};i=i+1) {
  local found:int=0;
  loop(local j:int=0;j<names.length;j=j+1) {
   if(strcmp(names.data[j].toString(),expected[i])==0) {found=found+1;}
  }
  if(found!=1) {return 2;}
 }
 loop(local i:int=0;i<names.length;i=i+1) {names.data[i].destroy();}names.destroy();
 names=FS.listDirChecked("${dir}/empty");if(names.length!=0) {return 3;}names.destroy();
 local paths:string[4]=[nullptr,"","${dir}/missing","${dir}/.hidden"];
 loop(local i:int=0;i<4;i=i+1) {
  local caught:bool=false;
  try {names=FS.listDirChecked(paths[i]);names.destroy();}catch(e:IOError) {caught=e.code!=0;}
  if(!caught) {return 4;}
  names=FS.listDir(paths[i]);if(names.length!=0) {return 5;}names.destroy();
 }
 return 0;
}`,
        expectedStdout: "",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

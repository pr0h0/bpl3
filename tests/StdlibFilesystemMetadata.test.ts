import { test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("filesystem metadata preserves large sizes and distinguishes symlinks from their targets", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-file-info-"));
  try {
    writeFileSync(join(dir, "file"), Buffer.from([65, 0, 66, 255]));
    writeFileSync(join(dir, "large"), "");
    truncateSync(join(dir, "large"), 4294967313);
    mkdirSync(join(dir, "directory"));
    symlinkSync("file", join(dir, "file-link"));
    symlinkSync("directory", join(dir, "dir-link"));
    symlinkSync("missing", join(dir, "broken"));
    symlinkSync("cycle", join(dir, "cycle"));
    expectCorrectnessSuite([
      {
        name: "filesystem-metadata",
        validateLlvm: true,
        source: `import [FS], [FileInfo] from "std/fs.bpl";
import [IOError] from "std/errors.bpl";
extern mkfifo(path:string,mode:uint) ret int;
extern unlink(path:string) ret int;
extern alarm(seconds:uint) ret uint;
frame main() ret int {
 local info:FileInfo=FS.stat("${dir}/file");
 if(info.size!=4 || !info.isFile || info.isDir || info.isSymlink) {return 1;}
 info=FS.stat("${dir}/large");if(info.size!=cast<long>(0x100000011) || !info.isFile) {return 2;}
 info=FS.lstat("${dir}/file");if(!info.isFile || info.size!=4) {return 3;}
 info=FS.stat("${dir}/directory");if(!info.isDir || info.isFile || info.isSymlink) {return 4;}
 if(!FS.stat("${dir}/directory").isDir || FS.stat("${dir}/large").size!=cast<long>(0x100000011)) {return 15;}
 info=FS.stat("${dir}/file-link");if(!info.isFile || info.size!=4 || info.isSymlink) {return 5;}
 info=FS.stat("${dir}/dir-link");if(!info.isDir || info.isSymlink) {return 6;}
 info=FS.lstat("${dir}/file-link");if(!info.isSymlink || info.isFile || info.isDir || info.size!=4) {return 7;}
 info=FS.lstat("${dir}/dir-link");if(!info.isSymlink || info.size!=9) {return 8;}
 info=FS.lstat("${dir}/broken");if(!info.isSymlink || info.size!=7) {return 9;}
 info=FS.lstat("${dir}/cycle");if(!info.isSymlink || info.size!=5) {return 10;}
 local paths:string[6]=[nullptr,"","${dir}/missing","${dir}/broken","${dir}/cycle","${dir}/file/child"];
 loop(local i:int=0;i<6;i=i+1) {
  local caught:bool=false;
  try {info=FS.stat(paths[i]);}catch(error:IOError) {caught=error.code!=0;}
  if(!caught) {return 11;}
  if(i!=3 && i!=4) {
   caught=false;try {info=FS.lstat(paths[i]);}catch(error:IOError) {caught=error.code!=0;}
   if(!caught) {return 12;}
  }
 }
 if(mkfifo("${dir}/fifo",cast<uint>(384))!=0) {return 13;}
 defer {unlink("${dir}/fifo");}
 alarm(cast<uint>(10));info=FS.stat("${dir}/fifo");alarm(cast<uint>(0));
 if(info.isFile || info.isDir || info.isSymlink) {return 14;}
 return 0;
}`,
        expectedStdout: "",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

import { test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("FS.exists checks metadata without opening files or waiting for FIFO writers", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-exists-"));
  try {
    writeFileSync(join(dir, "unreadable"), "exists");
    chmodSync(join(dir, "unreadable"), 0);
    mkdirSync(join(dir, "directory"));
    symlinkSync("unreadable", join(dir, "file-link"));
    symlinkSync("directory", join(dir, "dir-link"));
    symlinkSync("missing", join(dir, "broken"));
    symlinkSync("cycle", join(dir, "cycle"));
    expectCorrectnessSuite([
      {
        name: "filesystem-exists-metadata",
        validateLlvm: true,
        source: `import [FS] from "std/fs.bpl";
extern mkfifo(path:string,mode:uint) ret int;
extern unlink(path:string) ret int;
extern alarm(seconds:uint) ret uint;
frame main() ret int {
 if(!FS.exists("${dir}/unreadable") || !FS.exists("${dir}/directory")) {return 1;}
 if(!FS.exists("${dir}/file-link") || !FS.exists("${dir}/dir-link")) {return 2;}
 if(FS.exists(nullptr) || FS.exists("") || FS.exists("${dir}/missing")) {return 3;}
 if(FS.exists("${dir}/broken") || FS.exists("${dir}/cycle")) {return 4;}
 if(FS.exists("${dir}/unreadable/child")) {return 5;}
 if(mkfifo("${dir}/fifo",cast<uint>(384))!=0) {return 6;}
 defer {unlink("${dir}/fifo");}
 alarm(cast<uint>(10));
 local exists:bool=FS.exists("${dir}/fifo");
 alarm(cast<uint>(0));
 if(!exists) {return 7;}return 0;
}`,
        expectedStdout: "",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

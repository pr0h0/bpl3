import { test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("filesystem checks failures and preserves binary streams at O0/O3", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-fs-io-"));
  try {
    writeFileSync(
      join(dir, "large"),
      Buffer.from(Array.from({ length: 20000 }, (_, i) => i % 256)),
    );
    expectCorrectnessSuite([
      {
        name: "checked-filesystem",
        validateLlvm: true,
        source: `import [FS], [File] from "std/fs.bpl";
import [String] from "std/string.bpl"; import [Array] from "std/array.bpl";
import [IOError] from "std/errors.bpl"; import printf from "std/c.bpl";
frame main() ret int {
  local bytes:Array<u8>=FS.readBytes("${dir}/large");
  if(bytes.length!=20000) {return 1;}
  loop(local i:int=0;i<bytes.length;i=i+1) {if(bytes.data[i]!=cast<u8>(i)) {return 2;}}
  if(!FS.writeBytes("${dir}/copy",bytes.data,bytes.length)) {return 3;}
  bytes.destroy(); bytes=FS.readBytes("${dir}/copy");
  if(bytes.length!=20000 || bytes.data[19999]!=cast<u8>(19999)) {return 4;} bytes.destroy();
  if(!FS.writeBytes("${dir}/empty",nullptr,0)) {return 5;}
  bytes=FS.readBytes("${dir}/empty");if(bytes.length!=0) {return 6;}bytes.destroy();
  if(FS.writeBytes("${dir}/empty",nullptr,1) || FS.writeBytes("${dir}/empty",nullptr,-1)) {return 7;}
  if(!FS.writeFile("${dir}/text","hello")) {return 8;}
  local file:File=File.open("${dir}/text","a");
  if(!file.write(" world") || !file.close() || file.handle!=nullptr || !file.close()) {return 9;}
  if(file.write("closed") || file.readLine(nullptr,10)) {return 10;}
  local content:String=FS.readFile("${dir}/text");
  if(content.length!=11) {return 11;} printf("%s\\n",content.data);content.destroy();
  content=FS.readFile("${dir}/large");if(content.length!=0) {return 12;}content.destroy();
  local caught:bool=false;
  try {bytes=FS.readBytes("${dir}/missing");}catch(e:IOError) {caught=e.code!=0;}if(!caught) {return 13;}
  caught=false;try {content=FS.readFile("${dir}");}catch(e:IOError) {caught=e.code!=0;}if(!caught) {return 14;}
  local names:Array<String>=FS.listDir("${dir}"); if(names.length!=4) {return 15;}
  loop(local i:int=0;i<names.length;i=i+1) {names.data[i].destroy();}names.destroy();
  ${
    process.platform === "linux"
      ? `if(FS.writeFile("/dev/full","buffered failure")) {return 16;}
  file=File.open("/dev/full","w");file.write("buffered failure");if(file.close()) {return 17;}
  bytes=FS.readBytes("/proc/self/cmdline");if(bytes.length==0) {return 18;}bytes.destroy();`
      : ""
  }
  return 0;
}`,
        expectedStdout: "hello world\n",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

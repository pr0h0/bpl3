import { test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("File.readBytes streams binary chunks, reports EOF, and rejects invalid reads", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-file-read-"));
  try {
    const path = join(dir, "input");
    writeFileSync(
      path,
      Buffer.from(Array.from({ length: 4103 }, (_, i) => i % 256)),
    );
    expectCorrectnessSuite([
      {
        name: "file-binary-chunks",
        validateLlvm: true,
        source: `import [File] from "std/fs.bpl";import [IOError] from "std/errors.bpl";import printf from "std/c.bpl";
frame main() ret int {
 local file:File=File.open("${path}","rb");if(file.handle==nullptr) {return 1;}
 local buffer:u8[257];local offset:int=0;local count:int=0;local caught:bool=false;
 if(file.readBytes(nullptr,0)!=0) {return 2;}
 buffer[0]=cast<u8>(19);
 ${["file.readBytes(nullptr,1)", "file.readBytes(&buffer[0],-1)"].map((call) => `caught=false;try {count=${call};}catch(e:IOError) {caught=e.code!=0;}if(!caught || buffer[0]!=cast<u8>(19)) {return 3;}`).join("\n")}
 loop {
  count=file.readBytes(&buffer[0],257);if(count==0) {break;}
  if(count<0 || count>257) {return 4;}
  loop(local i:int=0;i<count;i=i+1) {if(buffer[i]!=cast<u8>(offset+i)) {return 5;}}
  offset=offset+count;
 }
 if(offset!=4103 || file.readBytes(&buffer[0],257)!=0 || !file.close()) {return 6;}
 caught=false;try {count=file.readBytes(&buffer[0],1);}catch(e:IOError) {caught=e.code!=0;}if(!caught) {return 7;}
 file=File.open("${dir}/write-only","wb");if(file.handle==nullptr) {return 8;}
 caught=false;try {count=file.readBytes(&buffer[0],1);}catch(e:IOError) {caught=e.code!=0;}file.close();if(!caught) {return 9;}
 printf("streamed %d bytes\\n",offset);return 0;
}`,
        expectedStdout: "streamed 4103 bytes\n",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

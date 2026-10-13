import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("extern structs keep private field aliases from their declaring module", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-extern-field-alias-"));
  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 30000 });
    if (result.status !== 0)
      throw new Error(`${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  try {
    writeFileSync(join(dir, "types.bpl"), `
      export [Packet];
      type Count=long; type Row=short[3];
      struct Packet {count:Count,row:Row,}
    `);
    writeFileSync(join(dir, "main.bpl"), `
      import [Packet] from "./types.bpl";
      type Count=Lambda<int>(int); type Row=int[];
      extern sum_packet(packet:Packet) ret long;
      frame main() ret int {
        local packet:Packet;
        packet.count=4294967296;
        packet.row[0]=-32768 as short; packet.row[1]=7; packet.row[2]=11;
        if (sum_packet(packet)!=4294934546) {return 1;}
        return 0;
      }
    `);
    writeFileSync(join(dir, "provider.c"), `
      #include <stdint.h>
      struct Packet {int64_t count; int16_t row[3];};
      int64_t sum_packet(struct Packet packet) {
        return packet.count + packet.row[0] + packet.row[1] + packet.row[2];
      }
    `);
    run(process.env.CC || "clang", ["-O3", "-c", join(dir, "provider.c"), "-o", join(dir, "provider.o")]);
    for (const opt of [0, 3]) {
      run("bun", [resolve("index.ts"), "build", join(dir, "main.bpl"), "--object", join(dir, "provider.o"), "-O", String(opt), "-o", join(dir, "out")]);
      run(join(dir, "out"), []);
    }

    // The caller's scalar alias must not hide a private slice inside Packet.
    writeFileSync(join(dir, "types.bpl"), `
      export [Packet]; type Row=int[]; struct Packet {row:Row,}
    `);
    writeFileSync(join(dir, "main.bpl"), `
      import [Packet] from "./types.bpl"; type Row=int;
      extern consume(packet:Packet); frame main() ret int {return 0;}
    `);
    const rejected = spawnSync("bun", [resolve("index.ts"), "check", join(dir, "main.bpl"), "--json"], {encoding:"utf8",timeout:30000});
    expect(rejected.status).toBe(1);
    expect(`${rejected.stdout}${rejected.stderr}`).toContain("BPL_EXTERN_ABI_UNSUPPORTED");
    expect(`${rejected.stdout}${rejected.stderr}`).toContain("slice fields");
  } finally {
    rmSync(dir, {recursive:true,force:true});
  }
}, 90000);

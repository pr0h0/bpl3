import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { getHostTargetTriple } from "../compiler/common/HostTarget";
import { getHostDefaults } from "../cli/utils";
import { getConfig } from "../compiler/common/Config";

const hosts = [
  ["linux", "x64", "x86_64-unknown-linux-gnu", "x86_64-sysv"],
  ["darwin", "x64", "x86_64-apple-darwin", "x86_64-sysv"],
  ["linux", "arm64", "aarch64-unknown-linux-gnu", "aarch64-aapcs"],
  ["darwin", "arm64", "aarch64-apple-darwin", "aarch64-darwin"],
  ["win32", "x64", "x86_64-pc-windows-msvc", "x86_64-win64"],
  ["linux", "ia32", "i686-unknown-linux-gnu", "i386-sysv"],
] as const;

for (const [platform, arch, triple, abi] of hosts) {
  test(`compiler API uses the native ${platform}/${arch} aggregate ABI by default`, () => {
    expect(getHostTargetTriple(platform, arch)).toBe(triple);
    // Simulate a host only inside a child process; no platform globals in the
    // test runner change while other tests execute.
    const script = `
      Object.defineProperty(process,"arch",{value:${JSON.stringify(arch)}});
      Object.defineProperty(process,"platform",{value:${JSON.stringify(platform)}});
      const {Compiler}=await import(${JSON.stringify(resolve("compiler/index.ts"))});
      const {getCAbiKind}=await import(${JSON.stringify(resolve("compiler/backend/codegen/abi/CAbi.ts"))});
      const {getDataLayoutForTarget}=await import(${JSON.stringify(resolve("compiler/backend/codegen/BaseCodeGenerator.ts"))});
      const result=new Compiler({filePath:"native.bpl"}).compile(
        "struct Triple {x:double,y:double,z:double,} extern native_triple(input:Triple) ret Triple; frame probe(input:Triple) ret Triple {return native_triple(input);}"
      );
      console.log(JSON.stringify({success:result.success,output:result.output,errors:result.errors?.map(e=>e.message),abi:getCAbiKind(),layout:getDataLayoutForTarget()}));
    `;
    const child = spawnSync("bun", ["-e", script], {
      encoding: "utf8",
      timeout: 30000,
    });
    expect(child.status).toBe(0);
    const result = JSON.parse(child.stdout);
    expect(result.success).toBe(true);
    expect(result.output).toContain(`target triple = "${triple}"`);
    expect(result.output).toContain(`target datalayout = "${result.layout}"`);
    expect(result.abi).toBe(abi);
    if (arch === "arm64") {
      expect(result.output).toContain("declare %struct.Triple @native_triple([3 x double]");
      expect(result.output).not.toContain("byval(%struct.Triple)");
    } else {
      expect(result.output).toContain("sret(%struct.Triple)");
    }
  });
}

test("CLI and configuration use the same native target as the compiler API", () => {
  expect(getHostDefaults().target).toBe(getHostTargetTriple());
  expect(getConfig().defaults.target).toBe(getHostTargetTriple());
});

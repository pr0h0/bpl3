import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

for (const declaration of [
  "type Callback=Func<int>(int); extern bad(p:*Callback);",
  "type Callback<T>=Func<T>(T); extern bad(p:*Callback<int>);",
  "type Callback=Func<int>(int); type Pointer<T>=*T; extern bad(p:Pointer<Callback>);",
  "type Pair=(int,int); extern bad(p:*Pair);",
  "type Pair<T>=(T,T); extern bad(p:*Pair<int>);",
  "type Closure=Lambda<int>(int); frame bad(p:*Closure) {}",
  "type Closure<T>=Lambda<T>(T); frame bad(p:*Closure<int>) {}",
  "type Callbacks=Func<int>(int)[2]; extern bad(p:*Callbacks);",
]) {
  test(`rejects erased pointer indirection: ${declaration}`, () => {
    const result = new Compiler({ filePath: "pointers.bpl" }).compile(
      declaration,
    );
    expect(result.success).toBe(false);
    expect(
      result.errors?.some(
        (e) => e.code === "BPL_TYPE_ALIAS_POINTER_UNSUPPORTED",
      ),
    ).toBe(true);
  });
}

test("unsupported callback-pointer diagnostics remain parseable JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-callback-pointer-"));
  try {
    const source = join(dir, "api.bpl");
    writeFileSync(
      source,
      "type Callback=Func<int>(int); extern bad(p:*Callback);",
    );
    const result = spawnSync(
      "bun",
      [resolve("index.ts"), "check", source, "--json"],
      { encoding: "utf8", timeout: 15000 },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.stringify(JSON.parse(result.stdout))).toContain(
      "BPL_TYPE_ALIAS_POINTER_UNSUPPORTED",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

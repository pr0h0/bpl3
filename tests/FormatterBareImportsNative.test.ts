import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";

test("bare import formatting preserves exported calls at O0 and O3", () => {
  const root = path.resolve(import.meta.dir, "..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-format-bare-import-"));
  const source =
    'import "./value.bpl";import [printf] from "std/c.bpl";frame main()ret int{printf("%d\\n",value());return 0;}';
  try {
    fs.writeFileSync(
      path.join(dir, "value.bpl"),
      "export value;frame value()ret int{return 42;}",
    );
    const original = path.join(dir, "original.bpl");
    const formatted = path.join(dir, "formatted.bpl");
    fs.writeFileSync(original, source);
    fs.writeFileSync(
      formatted,
      new Formatter().format(new Parser(source, original).parse()),
    );
    for (const file of [original, formatted])
      for (const level of [0, 3]) {
        const result = spawnSync(
          process.execPath,
          [
            path.join(root, "index.ts"),
            "run",
            file,
            "-O",
            String(level),
            "--quiet",
          ],
          {
            cwd: dir,
            env: { ...process.env, BPL_HOME: root, NO_COLOR: "1" },
            encoding: "utf8",
            timeout: 30000,
          },
        );
        expect({ status: result.status, stderr: result.stderr }).toEqual({
          status: 0,
          stderr: "",
        });
        expect(result.stdout).toBe("42\n");
      }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { formatSource } from "../cli/commands/formatEngine";

const project = path.resolve(import.meta.dir, "..");
const source = "frame main(){local n:int=1; # value\n}";
for (const args of [["build"], [], ["build", "-O", "1"]]) {
  test(`formatted emit matches format command: ${JSON.stringify(args)}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-emit-format-"));
    try {
      const file = path.join(dir, "main.bpl");
      fs.writeFileSync(file, source);
      fs.writeFileSync(
        path.join(dir, ".bplfmt.json"),
        '{"indentWidth":2,"lineEnding":"crlf"}',
      );
      const result = spawnSync(
        process.execPath,
        [path.join(project, "index.ts"), ...args, file, "--emit", "formatted"],
        {
          cwd: dir,
          env: { ...process.env, BPL_HOME: project },
          encoding: "utf8",
          timeout: 30000,
        },
      );
      expect({ status: result.status, stderr: result.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(result.stdout).toBe(
        formatSource(source, file, { indentWidth: 2, lineEnding: "crlf" }),
      );
      expect(fs.readFileSync(file, "utf8")).toBe(source);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

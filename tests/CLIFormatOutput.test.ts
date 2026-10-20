import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { formatSource } from "../cli/commands/formatEngine";

const root = path.resolve(import.meta.dir, "..");
for (const source of [
  "frame main(){}",
  "# header\nframe main(){local n:int=1; # value\n}",
  "# header\r\nframe main(){}\r\n",
]) {
  test(`stdout formatting equals written output: ${JSON.stringify(source)}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-format-output-"));
    try {
      const file = path.join(dir, "main.bpl");
      fs.writeFileSync(file, source);
      const run = (args: string[]) =>
        spawnSync(
          process.execPath,
          [path.join(root, "index.ts"), "format", ...args, file],
          {
            cwd: dir,
            env: { ...process.env, BPL_HOME: root },
            encoding: "utf8",
            timeout: 30000,
          },
        );
      const stdout = run([]);
      expect({ status: stdout.status, stderr: stdout.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(stdout.stdout).toBe(formatSource(source, file));
      const written = run(["--write"]);
      expect(written.status).toBe(0);
      expect(fs.readFileSync(file, "utf8")).toBe(stdout.stdout);
      expect(run(["--check"]).status).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const enabled = process.env.BPL_TEST_COMPILER_DOCKER === "1";
test.skipIf(!enabled)(
  "compiler container formats read-only mounted sources with project style",
  () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-format-container-"));
    const image = process.env.BPL_COMPILER_IMAGE || "bpl-compiler:local";
    const source = "frame main(){local values:int[2]=[1, # first\n2];}";
    try {
      const file = path.join(dir, "main.bpl");
      fs.writeFileSync(file, source);
      fs.writeFileSync(
        path.join(dir, ".bplfmt.json"),
        JSON.stringify({ indentWidth: 2, lineEnding: "crlf" }),
      );
      const run = (args: string[]) =>
        spawnSync(
          "docker",
          [
            "run",
            "--rm",
            "--user",
            `${process.getuid?.() ?? 10001}:${process.getgid?.() ?? 10001}`,
            "-v",
            `${dir}:/work:ro`,
            "-w",
            "/work",
            image,
            ...args,
          ],
          { encoding: "utf8", timeout: 30000 },
        );
      const formatted = run(["format", "main.bpl"]);
      expect({ status: formatted.status, stderr: formatted.stderr }).toEqual({
        status: 0,
        stderr: "",
      });
      expect(formatted.stdout).toContain("\r\n  local values");
      expect(formatted.stdout).toContain("1, # first\r\n    2");
      expect(formatted.stdout).not.toMatch(/(?<!\r)\n/);
      expect(formatted.stdout.endsWith("}\r\n")).toBe(true);
      const emitted = run(["build", "main.bpl", "--emit", "formatted"]);
      expect(emitted.status).toBe(0);
      expect(emitted.stdout).toBe(formatted.stdout);
      const defaults = run(["format", "--no-config", "main.bpl"]);
      expect(defaults.status).toBe(0);
      expect(defaults.stdout).toContain("\n    local values");
      expect(defaults.stdout).not.toContain("\r");
      const check = run(["format", "--check", "--json", "main.bpl"]);
      expect(check.status).toBe(1);
      expect(JSON.parse(check.stdout).success).toBe(false);
      expect(fs.readFileSync(file, "utf8")).toBe(source);
      const schema = spawnSync(
        "docker",
        [
          "run",
          "--rm",
          "--entrypoint",
          "/bin/sh",
          image,
          "-c",
          "test -f /opt/bpl/schemas/bpl-format.schema.json",
        ],
        { encoding: "utf8", timeout: 30000 },
      );
      expect(schema.status, schema.stderr).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
  240000,
);

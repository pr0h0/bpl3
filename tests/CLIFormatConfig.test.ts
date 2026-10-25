import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const project = path.resolve(import.meta.dir, "..");
const source = "frame main(){local values:int[2]=[1, # first\n2];}";
function fixture(
  run: (
    root: string,
    file: string,
    cli: (args: string[]) => ReturnType<typeof spawnSync>,
  ) => void,
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cli-format-config-"));
  const nested = path.join(root, "src");
  fs.mkdirSync(nested);
  const file = path.join(nested, "main.bpl");
  fs.writeFileSync(file, source);
  const cli = (args: string[]) =>
    spawnSync(
      process.execPath,
      [path.join(project, "index.ts"), "format", ...args, file],
      {
        cwd: root,
        env: { ...process.env, BPL_HOME: project },
        encoding: "utf8",
        timeout: 30000,
      },
    );
  try {
    run(root, file, cli);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("project config applies to stdout, write and JSON checks", () =>
  fixture((root, file, cli) => {
    fs.writeFileSync(
      path.join(root, ".bplfmt.json"),
      JSON.stringify({ indentWidth: 2, lineEnding: "crlf" }),
    );
    const output = cli([]);
    expect(output.status).toBe(0);
    expect(String(output.stdout)).toContain("\r\n  local values");
    expect(String(output.stdout)).not.toMatch(/(?<!\r)\n/);
    const before = cli(["--check", "--json"]);
    expect(before.status).toBe(1);
    expect(JSON.parse(String(before.stdout)).success).toBe(false);
    expect(cli(["--write"]).status).toBe(0);
    expect(fs.readFileSync(file, "utf8")).toBe(String(output.stdout));
    const after = cli(["--check", "--json"]);
    expect(after.status).toBe(0);
    expect(JSON.parse(String(after.stdout)).success).toBe(true);
  }));

test("CLI preferences override project settings and --no-config chooses defaults", () =>
  fixture((root, _file, cli) => {
    fs.writeFileSync(
      path.join(root, ".bplfmt.json"),
      JSON.stringify({ indentWidth: 2, useTabs: true, lineEnding: "crlf" }),
    );
    const override = cli([
      "--indent-width",
      "3",
      "--no-use-tabs",
      "--line-ending",
      "lf",
    ]);
    expect(override.status).toBe(0);
    expect(String(override.stdout)).toContain("\n   local values");
    expect(String(override.stdout)).not.toContain("\r");
    const defaults = cli(["--no-config"]);
    expect(defaults.status).toBe(0);
    expect(String(defaults.stdout)).toContain("\n    local values");
    expect(String(defaults.stdout)).not.toContain("\r");
    const tabs = cli(["--no-config", "--use-tabs"]);
    expect(tabs.status).toBe(0);
    expect(String(tabs.stdout)).toContain("\n\tlocal values");
  }));

test("explicit config bypasses a malformed discovered config", () =>
  fixture((root, _file, cli) => {
    fs.writeFileSync(path.join(root, ".bplfmt.json"), "malformed");
    const explicit = path.join(root, "style.json");
    fs.writeFileSync(explicit, '{"indentWidth":2}');
    const output = cli(["--config", explicit]);
    expect(output.status).toBe(0);
    expect(String(output.stdout)).toContain("\n  local values");
  }));

for (const content of ["bad JSON", '{"indentWidth":0}', '{"unknown":true}']) {
  test(`invalid config preserves source and JSON parseability: ${content}`, () =>
    fixture((root, file, cli) => {
      fs.writeFileSync(path.join(root, ".bplfmt.json"), content);
      const written = cli(["--write"]);
      expect(written.status).toBe(1);
      expect(fs.readFileSync(file, "utf8")).toBe(source);
      const checked = cli(["--check", "--json"]);
      expect(checked.status).toBe(1);
      const result = JSON.parse(String(checked.stdout));
      expect(result.success).toBe(false);
      expect(result.files[0].errorCode).toBe("BPL_FORMAT_PROCESSING_ERROR");
      expect(String(checked.stderr)).toBe("");
      expect(fs.readFileSync(file, "utf8")).toBe(source);
    }));
}

for (const args of [
  ["--indent-width", "2x"],
  ["--indent-width", "0"],
  ["--line-ending", "cr"],
  ["--config", "missing.json"],
]) {
  test(`invalid CLI formatter preferences are reported in JSON: ${args.join(" ")}`, () =>
    fixture((_root, file, cli) => {
      const checked = cli([...args, "--check", "--json"]);
      expect(checked.status).toBe(1);
      const result = JSON.parse(String(checked.stdout));
      expect(result.success).toBe(false);
      expect(result.files[0].errorCode).toBe("BPL_FORMAT_PROCESSING_ERROR");
      expect(fs.readFileSync(file, "utf8")).toBe(source);
    }));
}

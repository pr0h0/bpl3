import { afterEach, beforeEach, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { expectJsonStdoutReport } from "./helpers/cliJson";

const cli = path.resolve("index.ts");
let root: string;
let project: string;
let linked: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-clean-logical-cwd-"));
  project = path.join(root, "project");
  linked = path.join(root, "linked");
  fs.mkdirSync(project);
  fs.symlinkSync(project, linked, "dir");
  fs.writeFileSync(path.join(project, "main.ll"), "; keep IR");
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

for (const mode of ["shell", "absolute", "equals", "relative"] as const) {
  test(`clean rejects a logical symlink directory supplied by ${mode}`, () => {
    const runtimeArgs =
      mode === "shell"
        ? []
        : mode === "equals"
          ? [`--cwd=${linked}`]
          : ["--cwd", mode === "relative" ? "linked" : linked];
    const result = spawnSync(
      process.execPath,
      [...runtimeArgs, cli, "clean", "--json"],
      {
        cwd: mode === "shell" ? project : root,
        env: {
          ...process.env,
          PWD: mode === "shell" ? linked : root,
          NO_COLOR: "1",
        },
        encoding: "utf8",
      },
    );
    const report = expectJsonStdoutReport(result, {
      status: 1,
      check: "clean",
      success: false,
    });
    expect(report.errorCode).toBe("BPL_CLEAN_WORKDIR_SYMLINK");
    expect(fs.readFileSync(path.join(project, "main.ll"), "utf8")).toBe(
      "; keep IR",
    );
  });
}

for (const mode of ["stale", "missing", "relative", "unset"] as const) {
  test(`clean ignores ${mode} inherited PWD`, () => {
    const other = path.join(root, "other");
    fs.mkdirSync(other);
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: "1" };
    if (mode === "unset") delete env.PWD;
    else
      env.PWD =
        mode === "stale"
          ? linked
          : mode === "missing"
            ? path.join(root, "missing")
            : "linked";
    const result = spawnSync(process.execPath, [cli, "clean", "--json"], {
      cwd: other,
      env,
      encoding: "utf8",
    });
    expectJsonStdoutReport(result, {
      status: 0,
      check: "clean",
      success: true,
    });
    expect(fs.readFileSync(path.join(project, "main.ll"), "utf8")).toBe(
      "; keep IR",
    );
  });
}

import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

test("clean reports per-path failures and continues with other artifacts", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-clean-failures-"));
  const project = join(root, "project");
  mkdirSync(project);
  try {
    for (const name of ["a-denied", "b-unreadable", "c-clean"]) {
      writeFileSync(join(project, `${name}.bpl`), "frame main(){}");
      writeFileSync(join(project, `${name}.ll`), "artifact");
    }
    mkdirSync(join(project, ".bpl-cache"));
    const script = join(root, "clean.ts");
    // Inject deterministic filesystem failures instead of relying on host uid or
    // platform permission behavior. Run in a child to keep fs and exitCode local.
    writeFileSync(
      script,
      `
      import fs from "fs";
      import {mock} from "bun:test";
      import path from "path";
      const remove = fs.rmSync;
      const stat = fs.lstatSync;
      const rmSync = (file, options) => {
        if (["a-denied.ll", ".bpl-cache"].includes(path.basename(String(file)))) {
          throw Object.assign(new Error("injected removal denied"), {code: "EACCES"});
        }
        return remove(file, options);
      };
      const lstatSync = (file, ...args) => {
        if (path.basename(String(file)) === "b-unreadable.bpl") {
          throw Object.assign(new Error("injected source denied"), {code: "EACCES"});
        }
        return stat(file, ...args);
      };
      mock.module("fs", () => ({...fs, rmSync, lstatSync}));
      const {runCleanCommand} = await import(${JSON.stringify(resolve("cli/commands/cleanAction.ts"))});
      runCleanCommand({json: true}, {parent: undefined});
    `,
    );
    const result = spawnSync(process.execPath, [script], {
      cwd: project,
      encoding: "utf8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toBe("");
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      success: false,
      errorCode: "BPL_CLEAN_FAILED",
      count: 1,
      entries: [{ path: "c-clean.ll", type: "file" }],
    });
    expect(
      report.errors.map((error: { path: string }) => error.path).sort(),
    ).toEqual([".bpl-cache", "a-denied.ll", "b-unreadable.bpl"]);
    expect(existsSync(join(project, "a-denied.ll"))).toBe(true);
    expect(existsSync(join(project, "b-unreadable.ll"))).toBe(true);
    expect(existsSync(join(project, "c-clean.ll"))).toBe(false);
    expect(existsSync(join(project, ".bpl-cache"))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

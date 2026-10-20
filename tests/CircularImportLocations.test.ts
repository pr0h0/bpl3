import { spawnSync } from "node:child_process";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompilerError } from "../compiler/common/CompilerError";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";

for (const selfImport of [false, true]) {
  test(`circular import points at the closing import edge: self=${selfImport}`, () => {
    const directory = mkdtempSync(join(tmpdir(), "bpl-cycle-location-"));
    try {
      const entry = join(directory, "main.bpl");
      const dependency = join(directory, "other.bpl");
      writeFileSync(join(directory, "errors.bpl"), "");
      writeFileSync(
        entry,
        `# entry\n\nimport "./${selfImport ? "main" : "other"}.bpl";\nframe main(){}`,
      );
      writeFileSync(dependency, '# dependency\n\n\n\nimport "./main.bpl";\n');
      let caught: unknown;
      try {
        new ModuleResolver({ stdLibPath: directory }).resolveModules(entry);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(CompilerError);
      const error = caught as CompilerError;
      expect(error.message).toContain("Circular dependency detected");
      expect(error.location).toMatchObject({
        file: selfImport ? entry : dependency,
        startLine: selfImport ? 3 : 5,
        startColumn: 1,
      });
      const build = spawnSync(
        "bun",
        [join(import.meta.dir, "../index.ts"), "build", entry, "--json"],
        {
          encoding: "utf8",
          env: { ...process.env, NO_COLOR: "1" },
          timeout: 15000,
        },
      );
      expect(build.status).toBe(1);
      expect(build.stderr).toBe("");
      const report = JSON.parse(build.stdout);
      expect(report.success).toBe(false);
      expect(report.diagnostics[0].location).toMatchObject({
        file: selfImport ? entry : dependency,
        start: { line: selfImport ? 3 : 5, column: 1 },
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}

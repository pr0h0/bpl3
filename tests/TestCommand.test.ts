import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Parser } from "../compiler/frontend/Parser";
import { findTestCases, generateTestMain } from "../cli/commands/testAction";

const BPL_CLI = path.resolve(import.meta.dir, "../index.ts");

function bplTest(cwd: string, args: string[] = []) {
  return spawnSync("bun", [BPL_CLI, "test", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 120000,
  });
}

function withProject(
  files: Record<string, string>,
  run: (dir: string) => void,
): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-test-command-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const MATH_TEST = `import [Assert] from "std/assert.bpl";

frame add(a: int, b: int) ret int {
    return a + b;
}

frame testAdds() {
    Assert.that(add(2, 2) == 4, "2 + 2 should be 4");
}

frame testFailsAssertion() {
    Assert.that(add(2, 2) == 5, "2 + 2 is not 5");
}

frame test_returns_status() ret int {
    return 3;
}

frame helperNotATest() {}
`;

describe("bpl test", () => {
  test("finds parameterless test frames and skips everything else", () => {
    const program = new Parser(
      `frame testA() {}
frame test_b() ret int { return 0; }
frame testWithArg(x: int) {}
frame tester() {}
frame helper() {}
frame testPointer() ret *int { return nullptr; }`,
      "cases_test.bpl",
    ).parse();
    expect(findTestCases(program)).toEqual([
      { name: "testA", returnsStatus: false },
      { name: "test_b", returnsStatus: true },
    ]);
  });

  test("rejects test files that define main", () => {
    const program = new Parser(
      "frame main() ret int { return 0; }",
      "main_test.bpl",
    ).parse();
    expect(() => findTestCases(program)).toThrow("must not define main");
  });

  test("generates a main that selects a test by index", () => {
    const main = generateTestMain([
      { name: "testA", returnsStatus: false },
      { name: "testB", returnsStatus: true },
    ]);
    expect(main).toContain("if (bplTestIndex == 0) {\n        testA();");
    expect(main).toContain("if (bplTestIndex == 1) {\n        return testB();");
  });

  test("runs each test and reports passes, failed assertions and statuses", () => {
    withProject(
      {
        "math_test.bpl": MATH_TEST,
        // Only *_test.bpl files are test files.
        "notes.bpl": "frame testIgnored() {}\n",
      },
      (dir) => {
        const result = bplTest(dir);
        expect(result.status).toBe(1);
        expect(result.stdout).toMatch(/PASS math_test\.bpl testAdds/);
        expect(result.stdout).toMatch(
          /FAIL math_test\.bpl testFailsAssertion[^\n]*\n\s+2 \+ 2 is not 5/,
        );
        expect(result.stdout).toMatch(
          /FAIL math_test\.bpl test_returns_status[^\n]*\n\s+exit status 3/,
        );
        expect(result.stdout).not.toContain("testIgnored");
        expect(result.stdout).toContain("1 passed, 2 failed");
      },
    );
  }, 120000);

  test("passes when every selected test passes, and reports JSON", () => {
    withProject({ "src/math_test.bpl": MATH_TEST }, (dir) => {
      const result = bplTest(dir, ["src", "--filter", "Adds", "--json"]);
      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report).toMatchObject({
        schemaVersion: 1,
        check: "test",
        success: true,
        totalFiles: 1,
        totalTests: 1,
        passed: 1,
        failed: 0,
        fileErrors: 0,
      });
      expect(report.files[0].tests[0]).toMatchObject({
        name: "testAdds",
        passed: true,
        exitCode: 0,
      });
    });
  }, 120000);

  test("reports a file that does not compile", () => {
    withProject(
      { "broken_test.bpl": 'frame testBroken() { local x: int = "no"; }\n' },
      (dir) => {
        const result = bplTest(dir, ["--json"]);
        expect(result.status).toBe(1);
        const report = JSON.parse(result.stdout);
        expect(report.fileErrors).toBe(1);
        expect(report.files[0].error).toContain("cannot assign string");
      },
    );
  }, 120000);

  test("fails with BPL_TEST_NO_INPUTS when there are no test files", () => {
    withProject(
      { "main.bpl": "frame main() ret int { return 0; }\n" },
      (dir) => {
        const result = bplTest(dir, ["--json"]);
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({
          check: "test",
          success: false,
          errorCode: "BPL_TEST_NO_INPUTS",
        });
      },
    );
  });
});

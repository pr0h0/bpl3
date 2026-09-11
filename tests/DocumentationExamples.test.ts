import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  DOCUMENTATION_ROOT,
  extractDocumentationExamples,
  loadDocumentationExamples,
} from "../tools/documentation_examples";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const examples = loadDocumentationExamples();
const programs = examples.filter(
  (example) => !example.fixture && !example.fragment,
);

// These programs are also executed at O0/O3, with output checked against the guide.
const expectedOutputs: Record<string, string> = {
  introduction: "Distance: 5.000000\nPoint is at (3, 4)\n",
  installation: "BPL is working!\n",
  "json-serialize": '{"id": 1, "name": "Alice", "active": true}\n',
  "json-parse": "User: Bob\n",
  "json-hook": '"redacted"\n',
  "simd-f32": "Results: 6.000000, 8.000000, 10.000000, 12.000000\n",
  "llvm-sqrt": "sqrt(2.0) = 1.414214\n",
};

test("documentation discovery includes programs by default and validates explicit classifications", () => {
  const markdown =
    "<!-- bpl-doc: fixture=helper.bpl -->\n```bpl\nexport helper;\n```\n" +
    "<!-- bpl-doc: expect-error=BPL_TEST -->\n<!-- rejected-example: demo -->\n```bpl\nframe main() { bad; }\n```\n" +
    "```bpl\nframe main() { }\n```";
  const found = extractDocumentationExamples("sample.md", markdown);
  expect(found).toHaveLength(3);
  expect(found[0]!.fixture).toBe("helper.bpl");
  expect(found[1]!.expectedError).toBe("BPL_TEST");
  expect(found[2]!.expectedError).toBeUndefined();
  expect(() =>
    extractDocumentationExamples(
      "sample.md",
      markdown.replace("helper.bpl", "../helper.bpl"),
    ),
  ).toThrow();
  expect(programs.length).toBeGreaterThan(150);
  const runIds = examples.flatMap((example) =>
    example.run ? [example.run] : [],
  );
  expect(runIds.sort()).toEqual(Object.keys(expectedOutputs).sort());
});

describe.skipIf(process.platform === "win32")(
  "documented programs compile with the real CLI and Clang",
  () => {
    for (const example of programs) {
      test.skipIf(!!example.arch && example.arch !== process.arch)(
        `${example.file}:${example.line} (block ${example.block})`,
        () => {
          const directory = mkdtempSync(join(tmpdir(), "bpl-doc-example-"));
          try {
            const fixtures = examples.filter(
              (candidate) =>
                candidate.file === example.file && candidate.fixture,
            );
            const names = new Set<string>();
            for (const fixture of fixtures) {
              if (names.has(fixture.fixture!))
                throw new Error(`Duplicate fixture: ${fixture.fixture}`);
              names.add(fixture.fixture!);
              writeFileSync(join(directory, fixture.fixture!), fixture.source);
            }
            const sourcePath = join(directory, "main.bpl");
            writeFileSync(sourcePath, example.source);
            const result = spawnSync(
              process.execPath,
              [
                join(DOCUMENTATION_ROOT, "index.ts"),
                "build",
                sourcePath,
                "--emit",
                "llvm",
                "-o",
                join(directory, "main.ll"),
                "--json",
              ],
              {
                cwd: directory,
                env: { ...process.env, BPL_HOME: DOCUMENTATION_ROOT },
                encoding: "utf8",
                timeout: 30000,
                maxBuffer: 4 * 1024 * 1024,
              },
            );
            if (result.error) throw result.error;
            const diagnostics = `${result.stdout}\n${result.stderr}`;
            if (example.expectedError) {
              expect(result.status, diagnostics).toBe(1);
              const response = JSON.parse(result.stdout);
              expect(
                response.diagnostics.some(
                  (diagnostic: { code?: string }) =>
                    diagnostic.code === example.expectedError,
                ),
                diagnostics,
              ).toBe(true);
            } else {
              expect(result.status, diagnostics).toBe(0);
            }
          } finally {
            rmSync(directory, { recursive: true, force: true });
          }
        },
        40000,
      );
      if (example.run) {
        test.skipIf(!!example.arch && example.arch !== process.arch)(
          `documented output: ${example.run} at O0/O3`,
          () => {
            expectCorrectnessSuite([
              {
                name: example.run!,
                source: example.source,
                validateLlvm: true,
                expectedStdout: expectedOutputs[example.run!]!,
              },
            ]);
          },
          60000,
        );
      }
    }
  },
);

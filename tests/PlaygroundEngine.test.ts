import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "fs";
import os from "os";
import { basename, dirname } from "path";
import {
  compileAndRun,
  disposeNativeBinaryCache,
} from "../playground/backend/engine";

// The engine runs compiled programs directly; the server's Docker runner is
// not involved in-process.
const program = (value: number) =>
  [
    "extern printf(fmt: string, ...) ret int;",
    "frame main() ret int {",
    `    printf("%d\\n", ${value});`,
    "    return 0;",
    "}",
  ].join("\n");

// Runs `work` while recording the playground request directories it creates.
async function playgroundTempDirs<T>(
  work: () => Promise<T>,
): Promise<{ result: T; dirs: string[] }> {
  const dirs: string[] = [];
  const create = fs.mkdtempSync;
  const spy = spyOn(fs, "mkdtempSync").mockImplementation(((
    prefix: string,
    options?: fs.EncodingOption,
  ) => {
    const dir = create(prefix, options) as string;
    if (basename(dir).startsWith("bpl-playground-")) dirs.push(dir);
    return dir;
  }) as typeof fs.mkdtempSync);
  try {
    return { result: await work(), dirs };
  } finally {
    spy.mockRestore();
  }
}

describe("playground engine", () => {
  afterEach(() => disposeNativeBinaryCache());

  test("each request compiles in its own system temp directory, removed afterwards", async () => {
    // Artifact runs are not cached, so their directories go when they finish.
    const { result, dirs } = await playgroundTempDirs(() =>
      Promise.all(
        [101, 102].map((value) =>
          compileAndRun({ code: program(value), includeArtifacts: true }),
        ),
      ),
    );

    expect(result.map((response) => response.output?.trim())).toEqual([
      "101",
      "102",
    ]);
    expect(dirs).toHaveLength(2);
    expect(new Set(dirs).size).toBe(2);
    for (const dir of dirs) {
      expect(dirname(dir)).toBe(os.tmpdir());
      expect(fs.existsSync(dir)).toBe(false);
    }
  }, 60000);

  test("a repeated artifact-free run reuses the cached binary without a temp directory", async () => {
    const first = await playgroundTempDirs(() =>
      compileAndRun({ code: program(201) }),
    );
    const second = await playgroundTempDirs(() =>
      compileAndRun({ code: program(201) }),
    );

    expect(first.result.output?.trim()).toBe("201");
    expect(first.dirs).toHaveLength(1);
    expect(second.result.output?.trim()).toBe("201");
    expect(second.dirs).toEqual([]);
    // The cached binary lives in the first run's directory until disposal.
    expect(fs.existsSync(first.dirs[0]!)).toBe(true);
    disposeNativeBinaryCache();
    expect(fs.existsSync(first.dirs[0]!)).toBe(false);
  }, 60000);

  // Runtime check helpers live in std/errors.bpl and reach a program through
  // the implicit prelude, so a source without imports must still link them.
  test("programs without imports link the prelude's runtime check helpers", async () => {
    const response = await compileAndRun({
      code: [
        "extern printf(fmt: string, ...) ret int;",
        "frame main() ret int {",
        "    local values: int[2] = [3, 4];",
        "    local index: int = 1;",
        '    printf("%d\\n", values[index] / index);',
        "    return 0;",
        "}",
      ].join("\n"),
    });

    expect(response.error).toBeUndefined();
    expect(response.output?.trim()).toBe("4");
  }, 60000);
});

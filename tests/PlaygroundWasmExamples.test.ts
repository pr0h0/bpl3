import { describe, expect, test } from "bun:test";
import {
  WASM_COMPATIBILITY_MATRIX,
} from "./helpers/wasmCompatibilityMatrix";
import { loadPlaygroundExamples } from "./helpers/playgroundExamples";

describe("Playground wasm example metadata", () => {
  test("keeps common C externs centralized in std/c.bpl", () => {
    const commonCExterns =
      /\bextern\s+(?:printf|fprintf|dprintf|sprintf|snprintf|puts|putchar|scanf|gets|write|malloc|free|memcpy|memmove|memset|strlen|strcmp|strncmp|strcpy|strcat|atoi)\b/;
    const directCExternExamples = loadPlaygroundExamples().flatMap((example) => {
      const code = Array.isArray(example.code)
        ? example.code.join("\n")
        : example.code;
      const match = code.match(commonCExterns);
      return match ? [`${example.file}: ${match[0]}`] : [];
    });

    expect(directCExternExamples).toEqual([]);
  });

  test("marks wasm-friendly playground examples with explicit metadata", () => {
    const wasmExamples = loadPlaygroundExamples().filter(
      (example) => example.wasm !== undefined,
    );

    expect(wasmExamples.map((example) => example.file)).toEqual([
      "playground/examples/70-browser-wasm-showcase.json",
    ]);
    expect(wasmExamples[0]?.wasm).toMatchObject({
      mode: "wasm-hosted",
      browserRuntime: true,
      canonicalMatrixFile: "examples/wasm_hosted_transform/main.bpl",
    });
    expect(wasmExamples[0]?.wasm?.reason.length ?? 0).toBeGreaterThan(20);
  });

  test("keeps the browser wasm showcase runtime contract explicit", () => {
    const showcase = loadPlaygroundExamples().find(
      (example) =>
        example.file === "playground/examples/70-browser-wasm-showcase.json",
    );

    expect(showcase?.args).toEqual(["browser", "wasm"]);
    expect(showcase?.expectedOutput).toEqual(
      "BPL hosted wasm demo\nargv[1]: browser\nfib(7) verified\n",
    );
    expect(showcase?.wasm).toMatchObject({
      expectedReturn: 0,
      expectedStdout:
        "BPL hosted wasm demo\nargv[1]: browser\nfib(7) verified\n",
      expectedStderr: "",
    });
  });

  test("keeps playground wasm metadata aligned with the compiler compatibility matrix", () => {
    const matrixByFile = new Map(
      WASM_COMPATIBILITY_MATRIX.map((entry) => [entry.file, entry]),
    );
    const failures: string[] = [];

    for (const example of loadPlaygroundExamples()) {
      if (!example.wasm?.canonicalMatrixFile) {
        continue;
      }

      const matrixEntry = matrixByFile.get(example.wasm.canonicalMatrixFile);
      if (!matrixEntry) {
        failures.push(
          `${example.file}: missing matrix entry ${example.wasm.canonicalMatrixFile}`,
        );
        continue;
      }
      if (matrixEntry.mode !== example.wasm.mode) {
        failures.push(
          `${example.file}: mode ${example.wasm.mode} does not match ${example.wasm.canonicalMatrixFile} mode ${matrixEntry.mode}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

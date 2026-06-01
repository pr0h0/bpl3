import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import {
  WASM_COMPATIBILITY_MATRIX,
  type WasmCompatibilityMode,
} from "./helpers/wasmCompatibilityMatrix";

const PLAYGROUND_EXAMPLES_DIR = resolve(
  import.meta.dir,
  "../playground/examples",
);

interface PlaygroundWasmMetadata {
  mode: WasmCompatibilityMode;
  reason: string;
  browserRuntime: boolean;
  canonicalMatrixFile?: string;
}

interface PlaygroundExample {
  title: string;
  wasm?: PlaygroundWasmMetadata;
}

interface PlaygroundExampleWithPath extends PlaygroundExample {
  file: string;
}

function loadPlaygroundExamples(): PlaygroundExampleWithPath[] {
  return readdirSync(PLAYGROUND_EXAMPLES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      file: `playground/examples/${name}`,
      ...(JSON.parse(
        readFileSync(join(PLAYGROUND_EXAMPLES_DIR, name), "utf8"),
      ) as PlaygroundExample),
    }));
}

describe("Playground wasm example metadata", () => {
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

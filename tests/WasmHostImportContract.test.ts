import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const RUNTIME_WASM_HOST = resolve(
  import.meta.dir,
  "../lib/runtime_wasm_host.ll",
);
const PLAYGROUND_WASM_HOST_ADAPTER = resolve(
  import.meta.dir,
  "../playground/frontend/wasmHostAdapter.js",
);
const PLAYGROUND_INDEX = resolve(
  import.meta.dir,
  "../playground/frontend/index.html",
);
const PLAYGROUND_SERVER = resolve(
  import.meta.dir,
  "../playground/backend/server.ts",
);
const WASM_RUNTIME_TEST = resolve(import.meta.dir, "WasmRuntime.test.ts");
const COMPILER_OPTIONS_DOC = resolve(
  import.meta.dir,
  "../docs/39-compiler-options.md",
);

const HOSTED_WASM_ENV_IMPORTS = [
  "__bpl_host_write",
  "__bpl_host_exit",
  "__bpl_host_argc",
  "__bpl_host_argv_len",
  "__bpl_host_argv_copy",
  "__bpl_host_error",
] as const;

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function extractRuntimeHostImports(source: string): string[] {
  return sortedUnique(
    [...source.matchAll(/^declare\b.*@(__bpl_host_[A-Za-z0-9_]+)/gm)].map(
      (match) => match[1] ?? "",
    ),
  );
}

function extractHostAdapterMethods(source: string): string[] {
  return sortedUnique(
    [...source.matchAll(/^\s+(__bpl_host_[A-Za-z0-9_]+)\(/gm)].map(
      (match) => match[1] ?? "",
    ),
  );
}

function extractPlaygroundContract(source: string): string[] {
  const match = source.match(
    /const HOSTED_WASM_ENV_IMPORTS = Object\.freeze\(\[([\s\S]*?)\]\);/,
  );

  expect(match).not.toBeNull();

  return sortedUnique(
    [...(match?.[1] ?? "").matchAll(/"(__bpl_host_[A-Za-z0-9_]+)"/g)].map(
      (item) => item[1] ?? "",
    ),
  );
}

describe("Hosted wasm env import contract", () => {
  test("keeps runtime, browser playground, and test host imports aligned", () => {
    const runtime = readFileSync(RUNTIME_WASM_HOST, "utf8");
    const playgroundAdapter = readFileSync(
      PLAYGROUND_WASM_HOST_ADAPTER,
      "utf8",
    );
    const runtimeTest = readFileSync(WASM_RUNTIME_TEST, "utf8");
    const expected = [...HOSTED_WASM_ENV_IMPORTS].sort();

    expect(extractRuntimeHostImports(runtime)).toEqual(expected);
    expect(extractPlaygroundContract(playgroundAdapter)).toEqual(expected);
    expect(extractHostAdapterMethods(playgroundAdapter)).toEqual(expected);
    expect(extractHostAdapterMethods(runtimeTest)).toEqual(expected);
  });

  test("serves the browser wasm host adapter before the playground app shell", () => {
    const indexHtml = readFileSync(PLAYGROUND_INDEX, "utf8");
    const server = readFileSync(PLAYGROUND_SERVER, "utf8");
    const adapterScript = 'src="wasmHostAdapter.js"';
    const appScript = 'src="app.js"';

    expect(indexHtml).toContain(adapterScript);
    expect(indexHtml.indexOf(adapterScript)).toBeLessThan(
      indexHtml.indexOf(appScript),
    );
    expect(server).toContain('url.pathname === "/wasmHostAdapter.js"');
    expect(server).toContain("../frontend/wasmHostAdapter.js");
  });

  test("documents every required hosted wasm env import", () => {
    const docs = readFileSync(COMPILER_OPTIONS_DOC, "utf8");

    for (const importName of HOSTED_WASM_ENV_IMPORTS) {
      expect(docs).toContain(`env.${importName}`);
    }
  });
});

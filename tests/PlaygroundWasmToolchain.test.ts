import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  createPlaygroundWasmBuildEnv,
  resolvePlaygroundWasmLinker,
} from "../playground/backend/wasmToolchain";
import { writeNodeCommandShim } from "./helpers/executableShim";

describe("Playground wasm toolchain", () => {
  const serverSource = fs.readFileSync(
    path.resolve(import.meta.dir, "../playground/backend/server.ts"),
    "utf8",
  );
  const originalWasmLd = process.env.WASM_LD;
  const originalProbeTimeout = process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;

  afterEach(() => {
    if (originalWasmLd === undefined) {
      delete process.env.WASM_LD;
    } else {
      process.env.WASM_LD = originalWasmLd;
    }

    if (originalProbeTimeout === undefined) {
      delete process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;
    } else {
      process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS = originalProbeTimeout;
    }
  });

  test("honors WASM_LD through the shared wasm linker discovery helper", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-playground-wasm-tool-"),
    );
    try {
      const workingLinker = writeNodeCommandShim(
        path.join(tempDir, "playground-wasm-ld"),
        ["console.log('LLD 18.0.0');"],
      );
      process.env.WASM_LD = workingLinker;

      const result = resolvePlaygroundWasmLinker();

      expect(result).toEqual({
        ok: true,
        linker: workingLinker,
      });
      expect(createPlaygroundWasmBuildEnv(process.env, workingLinker)).toMatchObject(
        {
          WASM_LD: workingLinker,
        },
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("keeps the playground wasm endpoint wired to the shared helper", () => {
    expect(serverSource).toContain("resolvePlaygroundWasmLinker");
    expect(serverSource).toContain("createPlaygroundWasmBuildEnv");
    expect(serverSource).not.toContain("function findWasmLinker");
    expect(serverSource).not.toContain('"wasm-ld-18"');
  });

  test("keeps the playground wasm endpoint wired to the hosted wasm response cache", () => {
    expect(serverSource).toContain("HostedWasmResponseCache");
    expect(serverSource).toContain("getHostedWasmCacheKey");
    expect(serverSource).toContain("hostedWasmResponseCache.get");
    expect(serverSource).toContain("hostedWasmResponseCache.remember");
  });

  test("reports checked candidates when playground wasm linking is unavailable", () => {
    const missingLinker = path.join(
      os.tmpdir(),
      "definitely-missing-playground-wasm-ld",
    );

    const result = resolvePlaygroundWasmLinker({
      candidates: [missingLinker],
      env: {},
    });

    expect(result).toEqual({
      ok: false,
      error: [
        "BPL_REQUIRE_WASM_LD=1 requires a wasm linker.",
        `Checked candidates: ${missingLinker}`,
        "Reproduce required-linker failures: BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
        "Inspect toolchain state: bun index.ts doctor --json",
        "Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
      ].join("\n"),
    });
  });
});

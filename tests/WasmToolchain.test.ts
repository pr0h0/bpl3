import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  DEFAULT_WASM_LINKER_CANDIDATES,
  findWasmLinker,
  formatOptionalWasmRuntimeSkipMessage,
  formatRequiredWasmLinkerError,
  getWasmLinkerCandidates,
  getWasmLinkerProbeTimeoutMs,
} from "../cli/WasmToolchain";
import { writeNodeCommandShim } from "./helpers/executableShim";

describe("Wasm toolchain helpers", () => {
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

  test("uses WASM_LD as an explicit wasm linker override", () => {
    process.env.WASM_LD = "/opt/llvm/bin/wasm-ld-custom";

    expect(getWasmLinkerCandidates()).toEqual([
      "/opt/llvm/bin/wasm-ld-custom",
    ]);
  });

  test("keeps explicit WASM_LD as the only candidate when it matches a default", () => {
    process.env.WASM_LD = "wasm-ld";

    expect(getWasmLinkerCandidates()).toEqual(["wasm-ld"]);
  });

  test("parses wasm linker probe timeout from the environment", () => {
    expect(
      getWasmLinkerProbeTimeoutMs({
        BPL_WASM_LINKER_PROBE_TIMEOUT_MS: "1250",
      } as NodeJS.ProcessEnv),
    ).toBe(1250);
  });

  test("falls back and warns for invalid wasm linker probe timeouts", () => {
    const warnings: string[] = [];

    expect(
      getWasmLinkerProbeTimeoutMs(
        { BPL_WASM_LINKER_PROBE_TIMEOUT_MS: "0" } as NodeJS.ProcessEnv,
        (message) => warnings.push(message),
      ),
    ).toBe(5000);
    expect(warnings).toEqual([
      "Ignoring invalid BPL_WASM_LINKER_PROBE_TIMEOUT_MS=0; expected a positive integer; using 5000ms",
    ]);
  });

  test("formats required-linker failures with checked candidates", () => {
    const message = formatRequiredWasmLinkerError([
      "/opt/llvm/bin/wasm-ld-custom",
      "wasm-ld",
    ]);

    expect(message).toContain(
      "Checked candidates: /opt/llvm/bin/wasm-ld-custom, wasm-ld",
    );
    expect(message).toContain(
      "Reproduce required-linker failures: BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
    );
    expect(message).toContain(
      "Inspect toolchain state: bun index.ts doctor --json",
    );
  });

  test("formats optional wasm runtime skip diagnostics with next steps", () => {
    const message = formatOptionalWasmRuntimeSkipMessage([
      "/opt/llvm/bin/wasm-ld-custom",
      "wasm-ld",
    ]);

    expect(message).toContain(
      "Skipping wasm runtime execution: no usable standalone wasm linker found.",
    );
    expect(message).toContain(
      "This is an optional prerequisite skip, not a successful wasm execution.",
    );
    expect(message).toContain(
      "Checked candidates: /opt/llvm/bin/wasm-ld-custom, wasm-ld",
    );
    expect(message).toContain("Set BPL_REQUIRE_WASM_LD=1");
    expect(message).toContain("set WASM_LD");
    expect(message).toContain(
      "Reproduce as a hard failure: BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
    );
    expect(message).toContain(
      "Inspect toolchain state: bun index.ts doctor --json",
    );
  });

  test("finds the first usable wasm linker and skips missing candidates", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-wasm-tool-"));
    try {
      const workingLinker = writeNodeCommandShim(
        path.join(tempDir, "working-wasm-ld"),
        ["console.log('LLD 18.0.0');"],
      );

      expect(
        findWasmLinker([
          path.join(tempDir, "missing-wasm-ld"),
          workingLinker,
        ]),
      ).toBe(workingLinker);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

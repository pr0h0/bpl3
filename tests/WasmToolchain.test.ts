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

  test("uses WASM_LD before default wasm linker candidates", () => {
    process.env.WASM_LD = "/opt/llvm/bin/wasm-ld-custom";

    expect(getWasmLinkerCandidates()).toEqual([
      "/opt/llvm/bin/wasm-ld-custom",
      ...DEFAULT_WASM_LINKER_CANDIDATES,
    ]);
  });

  test("does not duplicate WASM_LD when it matches a default candidate", () => {
    process.env.WASM_LD = "wasm-ld";

    expect(getWasmLinkerCandidates()).toEqual(DEFAULT_WASM_LINKER_CANDIDATES);
  });

  test("formats required-linker failures with checked candidates", () => {
    expect(
      formatRequiredWasmLinkerError([
        "/opt/llvm/bin/wasm-ld-custom",
        "wasm-ld",
      ]),
    ).toContain("Checked candidates: /opt/llvm/bin/wasm-ld-custom, wasm-ld");
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

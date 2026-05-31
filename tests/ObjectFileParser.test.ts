import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  getObjectSymbolTool,
  ObjectFileParser,
} from "../compiler/middleend/ObjectFileParser";
import { writeNodeCommandShim } from "./helpers/executableShim";

describe("ObjectFileParser", () => {
  const originalBplNm = process.env.BPL_NM;
  const originalNm = process.env.NM;
  const originalSymbolTimeout = process.env.BPL_OBJECT_SYMBOL_TIMEOUT_MS;

  afterEach(() => {
    if (originalBplNm === undefined) {
      delete process.env.BPL_NM;
    } else {
      process.env.BPL_NM = originalBplNm;
    }

    if (originalNm === undefined) {
      delete process.env.NM;
    } else {
      process.env.NM = originalNm;
    }

    if (originalSymbolTimeout === undefined) {
      delete process.env.BPL_OBJECT_SYMBOL_TIMEOUT_MS;
    } else {
      process.env.BPL_OBJECT_SYMBOL_TIMEOUT_MS = originalSymbolTimeout;
    }
  });

  test("uses BPL_NM before NM before nm for object symbol parsing", () => {
    delete process.env.BPL_NM;
    delete process.env.NM;
    expect(getObjectSymbolTool()).toBe("nm");

    process.env.NM = "llvm-nm";
    expect(getObjectSymbolTool()).toBe("llvm-nm");

    process.env.BPL_NM = "/opt/llvm/bin/llvm-nm";
    expect(getObjectSymbolTool()).toBe("/opt/llvm/bin/llvm-nm");
  });

  test("parses defined and undefined nm symbols", () => {
    const symbols = ObjectFileParser.parseNmOutput(
      [
        "0000000000000000 T exported_function",
        "0000000000000008 D exported_data",
        "0000000000000010 B exported_bss",
        "                 U external_dependency",
        "0000000000000020 W weak_function",
        "0000000000000030 T .local_label",
        "0000000000000040 t local_function",
        "0000000000000050 R readonly_data",
        "0000000000000060 r local_readonly_data",
        "0000000000000070 V weak_object",
        "0000000000000080 C common_object",
      ].join("\n"),
    );

    expect(symbols).toEqual([
      {
        name: "exported_function",
        type: "function",
        isGlobal: true,
      },
      {
        name: "exported_data",
        type: "variable",
        isGlobal: true,
      },
      {
        name: "exported_bss",
        type: "variable",
        isGlobal: true,
      },
      {
        name: "external_dependency",
        type: "undefined",
        isGlobal: false,
      },
      {
        name: "weak_function",
        type: "function",
        isGlobal: true,
      },
      {
        name: "local_function",
        type: "function",
        isGlobal: false,
      },
      {
        name: "readonly_data",
        type: "variable",
        isGlobal: true,
      },
      {
        name: "local_readonly_data",
        type: "variable",
        isGlobal: false,
      },
      {
        name: "weak_object",
        type: "variable",
        isGlobal: true,
      },
      {
        name: "common_object",
        type: "variable",
        isGlobal: true,
      },
    ]);
  });

  test("reports object symbol tool spawn failures without raw system errors", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-object-symbol-tool-"),
    );
    const objectFile = path.join(tempDir, "main.o");
    const missingTool = path.join(tempDir, "missing-nm");
    const originalWarn = console.warn;
    const warnings: string[] = [];

    try {
      fs.writeFileSync(objectFile, "not a real object\n");
      process.env.BPL_NM = missingTool;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      };

      const symbols = ObjectFileParser.parseELFObject(objectFile);

      expect(symbols).toEqual([]);
      const output = warnings.join("\n");
      expect(output).toContain(missingTool);
      expect(output).toContain("command not found");
      expect(output).not.toContain("ENOENT");
    } finally {
      console.warn = originalWarn;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("times out hanging object symbol tools without raw system errors", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-object-symbol-timeout-"),
    );
    const objectFile = path.join(tempDir, "main.o");
    const hangingTool = writeNodeCommandShim(path.join(tempDir, "hanging-nm"), [
      "setInterval(() => {}, 1000);",
    ]);
    const originalWarn = console.warn;
    const warnings: string[] = [];

    try {
      fs.writeFileSync(objectFile, "not a real object\n");
      process.env.BPL_NM = hangingTool;
      process.env.BPL_OBJECT_SYMBOL_TIMEOUT_MS = "100";
      console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
      };

      const symbols = ObjectFileParser.parseELFObject(objectFile);

      expect(symbols).toEqual([]);
      const output = warnings.join("\n");
      expect(output).toContain(hangingTool);
      expect(output).toContain("timed out");
      expect(output).not.toContain("ETIMEDOUT");
    } finally {
      console.warn = originalWarn;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects missing and directory object parser inputs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-object-parser-"));
    const missingObject = path.join(tempDir, "missing.ll");
    const objectDir = path.join(tempDir, "objects");
    const targetObject = path.join(tempDir, "target.ll");
    const linkedObject = path.join(tempDir, "linked.ll");
    fs.mkdirSync(objectDir);
    fs.writeFileSync(targetObject, "declare void @external_symbol()\n");
    fs.symlinkSync(targetObject, linkedObject, "file");

    try {
      expect(() => ObjectFileParser.parseObjectFile(missingObject)).toThrow(
        /Object file not found/,
      );
      expect(() => ObjectFileParser.parseObjectFile(objectDir)).toThrow(
        /Object path is not a file/,
      );
      expect(() => ObjectFileParser.parseLLVMIR(objectDir)).toThrow(
        /Object path is not a file/,
      );
      expect(() => ObjectFileParser.parseELFObject(objectDir)).toThrow(
        /Object path is not a file/,
      );
      expect(() => ObjectFileParser.parseObjectFile(linkedObject)).toThrow(
        /Object path is a symbolic link/,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("rejects object parser inputs through symlinked parent directories", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "bpl-object-parser-parent-link-"),
    );
    const realRoot = path.join(tempDir, "real-root");
    const linkedRoot = path.join(tempDir, "linked-root");
    const linkedObject = path.join(linkedRoot, "module.ll");
    fs.mkdirSync(realRoot);
    fs.writeFileSync(
      path.join(realRoot, "module.ll"),
      "declare void @external_symbol()\n",
    );
    fs.symlinkSync(realRoot, linkedRoot, "dir");

    try {
      expect(() => ObjectFileParser.parseObjectFile(linkedObject)).toThrow(
        /Object parent path contains a symbolic link/,
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

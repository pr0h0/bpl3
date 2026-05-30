import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  getObjectSymbolTool,
  ObjectFileParser,
} from "../compiler/middleend/ObjectFileParser";

describe("ObjectFileParser", () => {
  const originalBplNm = process.env.BPL_NM;
  const originalNm = process.env.NM;

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

  test("rejects missing and directory object parser inputs", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-object-parser-"));
    const missingObject = path.join(tempDir, "missing.ll");
    const objectDir = path.join(tempDir, "objects");
    fs.mkdirSync(objectDir);

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
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

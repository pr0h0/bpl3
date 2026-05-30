import { afterEach, describe, expect, test } from "bun:test";

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
    ]);
  });
});

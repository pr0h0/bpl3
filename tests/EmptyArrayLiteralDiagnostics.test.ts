import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

for (const [name, source] of [
  ["fixed initializer", "frame main(){local values:int[2]=[];values;}"],
  ["slice initializer", "frame main(){local values:int[]=[];values;}"],
  ["global initializer", "global values:int[2]=[];frame main(){values;}"],
  ["assignment", "frame main(){local values:int[2]=[1,2];values=[];}"],
  ["return", "frame values()ret int[2]{return [];}frame main(){values();}"],
  ["argument", "frame take(values:int[]){values;}frame main(){take([]);}"],
  ["callback array", "frame main(){local values:Func<int>(int)[2]=[];values;}"],
  ["tuple array", "frame main(){local values:(int,int)[2]=[];values;}"],
  [
    "closure array",
    "frame main(){local values:Lambda<int>(int)[2]=[];values;}",
  ],
  ["standalone", "frame main(){[];}"],
  ["nested array", "frame main(){local values:int[2][2]=[[],[]];values;}"],
  ["tuple", "frame main(){local values:(int[2],int)=([],1);values;}"],
  [
    "struct field",
    "struct Box{values:int[2],}frame main(){local box:Box=Box{values:[]};box;}",
  ],
  ["conditional", "frame main(){local values:int[2]=true?[]:[1,2];values;}"],
  [
    "match",
    "frame main(){local values:int[2]=match(true){true=>[],false=>[1,2],};values;}",
  ],
] as const) {
  test(`empty array ${name} reports a located checker diagnostic`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "empty-array.bpl").parse());
    const errors = checker.getErrors();
    const error = errors.find(
      (error) => error.code === "BPL_ARRAY_LITERAL_TYPE_MISMATCH",
    );
    expect(error).toBeDefined();
    expect(error?.message).toContain("Empty array literals");
    expect(error?.location?.startLine).toBe(1);
    expect(error?.location?.startColumn).toBeGreaterThan(0);
    const column = error!.location!.startColumn;
    expect(source.slice(column - 1, column + 1)).toBe("[]");
  });
}

for (const command of ["check", "build"] as const) {
  test(`${command} emits JSON with the empty literal location`, () => {
    const root = mkdtempSync(join(tmpdir(), "bpl-empty-array-"));
    try {
      const file = join(root, "main.bpl");
      const output = join(root, "program");
      const source =
        "frame main(){\n    local values:int[2]=[];\n    values;\n}\n";
      writeFileSync(file, source);
      const result = spawnSync(
        "bun",
        [
          resolve(__dirname, "../index.ts"),
          command,
          file,
          "--json",
          ...(command === "build" ? ["-o", output] : []),
        ],
        { encoding: "utf8", timeout: 20000 },
      );
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout) as {
        success: boolean;
        errorCode?: string;
        diagnostics?: unknown[];
        files?: { diagnostics: unknown[] }[];
      };
      expect(report.success).toBe(false);
      const diagnostics =
        command === "check"
          ? report.files?.[0]?.diagnostics
          : report.diagnostics;
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics?.[0]).toMatchObject({
        code: "BPL_ARRAY_LITERAL_TYPE_MISMATCH",
        location: {
          start: { line: 2, column: source.split("\n")[1]!.indexOf("[]") + 1 },
        },
      });
      expect(result.stdout).not.toContain("Internal compiler error");
      expect(existsSync(output)).toBe(false);
      expect(existsSync(`${output}.ll`)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const source of [
  "frame main(){local values:int[2]=[1,2];values;}",
  "frame main(){local values:int[2];values[0]=1;values[1]=2;}",
]) {
  test(`nonempty and manually initialized arrays stay valid: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "valid-array.bpl").parse());
    expect(checker.getErrors()).toEqual([]);
  });
}

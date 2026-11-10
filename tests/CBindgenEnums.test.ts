import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateBplBindings } from "../compiler/tools/CBindgen";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 60000 });
  if (result.status !== 0)
    throw new Error(
      `${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`,
    );
  return result;
}

// A BPL enum crosses the C ABI as its variant index, so only a C enum whose
// values are 0, 1, 2, ... can become one. Bindings export what they declare.
test("C enum values survive bindgen and generated bindings can be imported", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-bindgen-enum-"));
  try {
    const header = join(dir, "api.h");
    const api = `
#define BASE 0x10
typedef enum Plain { PLAIN_A, PLAIN_B, PLAIN_C } Plain;
typedef enum Color { COLOR_RED = 1, COLOR_GREEN, COLOR_BLUE = 8 } Color;
enum Flags { F_A = 1 << 2, F_B = BASE | 1, F_C = F_A + F_B, F_D = -1 };
enum Odd { ODD_OK = 3, ODD_SIZE = sizeof(int), ODD_NEXT };
int color_value(Color color);
int plain_value(Plain plain);
`;
    writeFileSync(header, api);
    writeFileSync(
      join(dir, "api.c"),
      `${api}
int color_value(Color color) { return (int)color; }
int plain_value(Plain plain) { return (int)plain; }
`,
    );
    const bindings = generateBplBindings({ headerPath: header });
    expect(bindings).toContain("enum Plain {");
    expect(bindings).toContain("type Color = int;");
    expect(bindings).toContain("global const COLOR_RED: int = 1;");
    expect(bindings).toContain("global const COLOR_GREEN: int = 2;");
    expect(bindings).toContain("global const COLOR_BLUE: int = 8;");
    expect(bindings).toContain("global const F_A: int = 4;");
    expect(bindings).toContain("global const F_B: int = 17;");
    expect(bindings).toContain("global const F_C: int = 21;");
    expect(bindings).toContain("global const F_D: int = -1;");
    expect(bindings).toContain("global const ODD_OK: int = 3;");
    // Values the generator cannot evaluate are left for the reader.
    expect(bindings).toContain("# ODD_SIZE = sizeof(int): not translated");
    expect(bindings).toContain(
      "# ODD_NEXT = (follows an untranslated value): not translated",
    );
    expect(bindings).toContain("export [Color];");
    expect(bindings).toContain("export color_value;");

    writeFileSync(join(dir, "bindings.bpl"), bindings);
    writeFileSync(
      join(dir, "main.bpl"),
      `import [Color], [Plain], COLOR_BLUE, color_value, plain_value from "./bindings.bpl";
extern printf(fmt: string, ...);
frame main() ret int {
    local color: Color = COLOR_BLUE;
    printf("%d %d\\n", color_value(color), plain_value(Plain.PLAIN_C));
    return 0;
}
`,
    );
    const object = join(dir, "api.o");
    run(process.env.CC || "clang", ["-c", join(dir, "api.c"), "-o", object]);
    const binary = join(dir, "main");
    run("bun", [
      resolve("index.ts"),
      "build",
      join(dir, "main.bpl"),
      "--object",
      object,
      "-o",
      binary,
    ]);
    expect(run(binary, []).stdout).toBe("8 2\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

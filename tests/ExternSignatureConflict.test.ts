import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

// A module only sees its own `extern` line, so two modules can describe the
// same C function differently. One declaration reaches the linker, and the
// other module's calls were emitted against a signature the callee does not
// have: `declare i64 @strlen(i8*)` alongside `call i32 @strlen(i8* %3)`. That
// happened to read the right half of the return register on x86-64 and would
// not on a return type of a different class.
function build(files: Record<string, string>, entry: string) {
  const dir = mkdtempSync(join(tmpdir(), "bpl-extern-signature-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(join(dir, name), source);
    }
    return spawnSync(
      "bun",
      [
        resolve("index.ts"),
        "build",
        join(dir, entry),
        "-O0",
        "-o",
        join(dir, "out"),
      ],
      { encoding: "utf8", timeout: 60000 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const widthConflict = {
  "narrow.bpl": `export [Narrow];
extern strlen(s: string) ret int;
struct Narrow {
  frame measure(text: string) ret int { return strlen(text); }
}`,
  "wide.bpl": `export [Wide];
extern strlen(s: string) ret long;
struct Wide {
  frame measure(text: string) ret long { return strlen(text); }
}`,
  "main.bpl": `import [Narrow] from "./narrow.bpl";
import [Wide] from "./wide.bpl";
extern printf(fmt: string, ...);
frame main() ret int {
  printf("%d %ld\\n", Narrow.measure("abc"), Wide.measure("abc"));
  return 0;
}`,
};

test("two modules cannot declare one external function with different types", () => {
  const result = build(widthConflict, "main.bpl");
  expect(result.status).not.toBe(0);
  const output = `${result.stdout}${result.stderr}`;
  expect(output).toContain("BPL_EXTERN_SIGNATURE_CONFLICT");
  expect(output).toContain("strlen");
});

// The check compares what LLVM sees, not how the types were spelled, so
// modules that agree on the ABI still compile: `*void`, `string` and `*char`
// are all i8*, and `long`, `ulong` and `u64` are all i64.
test("spellings that mean the same C type are not a conflict", () => {
  const result = build(
    {
      "a.bpl": `export [A];
extern strlen(s: string) ret long;
extern free(ptr: *void) ret void;
extern malloc(size: long) ret *void;
struct A {
  frame measure(text: string) ret long { return strlen(text); }
  frame roundTrip() ret int {
    local p: *void = malloc(cast<long>(8));
    free(p);
    return 1;
  }
}`,
      "b.bpl": `export [B];
extern strlen(s: *char) ret u64;
extern free(ptr: string) ret void;
extern malloc(size: long) ret string;
struct B {
  frame measure(text: *char) ret u64 { return strlen(text); }
  frame roundTrip() ret int {
    local p: string = malloc(cast<long>(8));
    free(p);
    return 1;
  }
}`,
      "main.bpl": `import [A] from "./a.bpl";
import [B] from "./b.bpl";
extern printf(fmt: string, ...);
frame main() ret int {
  printf("%ld %lu %d\\n",
    A.measure("abcd"), B.measure(cast<*char>("abcde")),
    A.roundTrip() + B.roundTrip());
  return 0;
}`,
    },
    "main.bpl",
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

// The stdlib has to hold to the same rule: importing two modules that both
// call strlen used to produce the mismatched pair above.
test("stdlib modules agree on the C functions they share", () => {
  const result = build(
    {
      "main.bpl": `import [Hex] from "std/hex.bpl";
import [Base64] from "std/base64.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [String] from "std/string.bpl";
import [JSON] from "std/json.bpl";
extern printf(fmt: string, ...);
frame main() ret int {
  local sb: StringBuilder = StringBuilder.new(8);
  sb.append("abcd");
  printf("%s %s %s %d\\n",
    sb.toString(), Hex.encodeString("abcd"), Base64.encodeString("abcd"),
    sb.len());
  return 0;
}`,
    },
    "main.bpl",
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

// Taking an extern's address and reusing a cached C ABI wrapper must validate
// the source declaration too, before the wrapper cache hides a disagreement.
test("extern address uses cannot hide a conflicting return width", () => {
  const result = build({
    ...widthConflict,
    "narrow.bpl": widthConflict["narrow.bpl"].replace(
      'return strlen(text);',
      'local measure: Func<int>(string) = strlen; return measure(text);',
    ),
    "wide.bpl": widthConflict["wide.bpl"].replace(
      'return strlen(text);',
      'local measure: Func<long>(string) = strlen; return measure(text);',
    ),
  }, "main.bpl");
  expect(`${result.stdout}${result.stderr}`).toContain("BPL_EXTERN_SIGNATURE_CONFLICT");
});

test("cached aggregate wrappers cannot hide a scalar declaration", () => {
  const result = build({
    "a.bpl": `export [A];
struct Pair { x: int, y: int }
extern abs(value: Pair) ret int;
struct A { frame run() ret int { return abs(Pair {x: 1, y: 2}); } }`,
    "b.bpl": `export [B];
extern abs(value: int) ret int;
struct B { frame run() ret int { return abs(-3); } }`,
    "main.bpl": `import [A] from "./a.bpl";
import [B] from "./b.bpl";
frame main() ret int { return A.run() + B.run(); }`,
  }, "main.bpl");
  expect(`${result.stdout}${result.stderr}`).toContain("BPL_EXTERN_SIGNATURE_CONFLICT");
});

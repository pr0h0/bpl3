import { describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";

const examplesRoot = path.join(process.cwd(), "examples");

const centralizedCExterns = [
  /\bextern printf\((?:fmt|format|f): string, \.\.\.\)(?: ret int)?;/,
  /\bextern scanf\(fmt: string, \.\.\.\)(?: ret int)?;/,
  /\bextern puts\((?:s|value): string\) ret int;/,
  /\bextern malloc\(size: (?:int|long)\) ret \*void;/,
  /\bextern free\(ptr: \*void\)(?: ret void)?;/,
  /\bextern strlen\(s: string\) ret int;/,
  /\bextern strcmp\((?:s1|left): string, (?:s2|right): string\) ret int;/,
  /\bextern strcpy\((?:dst|dest): string, src: string\) ret string;/,
  /\bextern strcat\((?:dst|dest): string, src: string\) ret string;/,
  /\bextern atoi\(s: string\) ret int;/,
  /\bextern memcpy\(dest: \*void, src: \*void, n: long\) ret \*void;/,
  /\bextern memmove\(dest: \*void, src: \*void, n: long\) ret \*void;/,
  /\bextern memset\(dest: \*void, (?:value|c): int, n: long\) ret \*void;/,
];

function collectBplFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "bpl_modules") {
          return [];
        }
        return collectBplFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".bpl") ? [fullPath] : [];
    });
}

function isRawFfiExample(relativeFile: string): boolean {
  const normalized = relativeFile.split(path.sep).join("/");
  return (
    normalized === "examples/dwarf_test/main.bpl" ||
    normalized.includes("/test_ffi/") ||
    normalized.includes("/ffi_multifile/") ||
    normalized.includes("/ffi_") ||
    normalized.endsWith("/test_ffi.bpl")
  );
}

describe("Example extern declarations", () => {
  test("uses std/c.bpl for canonical common C declarations outside FFI demos", () => {
    const directExterns = collectBplFiles(examplesRoot).flatMap((file) => {
      const relativeFile = path.relative(process.cwd(), file);
      if (isRawFfiExample(relativeFile)) {
        return [];
      }

      const source = fs.readFileSync(file, "utf8");
      return centralizedCExterns.flatMap((pattern) => {
        const match = source.match(pattern);
        return match ? [`${relativeFile}: ${match[0]}`] : [];
      });
    });

    expect(directExterns).toEqual([]);
  });
});

import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("CharUtils", () => {
  it("should classify digits correctly", () => {
    const result = runBpl(
      `
      import [CharUtils] from "std/char_utils.bpl";
      extern printf(fmt: string, ...) ret int;
      
      frame main() ret int {
        if (CharUtils.isDigit('0')) printf("1"); else printf("0");
        if (CharUtils.isDigit('9')) printf("1"); else printf("0");
        if (CharUtils.isDigit('a')) printf("1"); else printf("0");
        printf("\\n");
        return 0;
      }
    `,
      "char_utils_digit",
    );
    if (result.stderr) console.error(result.stderr);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("110");
  });

  it("should classify whitespace correctly", () => {
    const result = runBpl(
      `
      import [CharUtils] from "std/char_utils.bpl";
      extern printf(fmt: string, ...) ret int;
      
      frame main() ret int {
        if (CharUtils.isWhitespace(' ')) printf("1"); else printf("0");
        if (CharUtils.isWhitespace('\\n')) printf("1"); else printf("0");
        if (CharUtils.isWhitespace('A')) printf("1"); else printf("0");
        printf("\\n");
        return 0;
      }
    `,
      "char_utils_space",
    );
    if (result.stderr) console.error(result.stderr);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("110");
  });

  it("should convert case correctly", () => {
    const result = runBpl(
      `
      import [CharUtils] from "std/char_utils.bpl";
      extern printf(fmt: string, ...) ret int;
      
      frame main() ret int {
        printf("%c", CharUtils.toLower('A'));
        printf("%c", CharUtils.toLower('z'));
        printf("%c", CharUtils.toUpper('a'));
        printf("%c", CharUtils.toUpper('Z'));
        printf("\\n");
        return 0;
      }
    `,
      "char_utils_case",
    );
    if (result.stderr) console.error(result.stderr);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("azAZ");
  });
});

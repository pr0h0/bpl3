import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

test("JSON escapes every representable control byte and preserves UTF-8", () => {
  const value =
    Array.from({ length: 31 }, (_, index) =>
      String.fromCharCode(index + 1),
    ).join("") + '"\\ café 😀';
  const bytes = [...Buffer.from(value), 0];
  const source = `
    import [JSON] from "std/json.bpl";
    import [String] from "std/string.bpl";
    import printf, strcmp from "std/c.bpl";
    frame main() ret int {
      local bytes: char[${bytes.length}] = [${bytes.map((byte) => `cast<char>(${byte})`).join(",")}];
      local text: string = cast<string>(&bytes[0]);
      local encoded: String = JSON.stringify<string>(&text);
      printf("%s\\n", encoded.toString());
      local decoded: *string = JSON.parse<string>(encoded.toString());
      if (decoded == nullptr || strcmp(*decoded, text) != 0) { return 1; }
      JSON.free<string>(decoded);
      encoded.destroy();
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify(value) + "\n",
    });
    expect(JSON.parse(result.stdout)).toBe(value);
  }
}, 60000);

import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";
import * as path from "path";

describe("Token", () => {
  it("should create and destroy tokens", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    const tokenPath = path.join(srcDir, "token.bpl");

    const program = `
        import [Token] from "${tokenPath}";
        import [TokenKind] from "${tokenPath}";
        import [Span] from "std/diagnostics.bpl";
        import [String] from "std/string.bpl";
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
            local span: Span = Span.new("test.bpl", 0, 4, 1, 1);
            local t: Token = Token.new(TokenKind.Identifier, "myVar", span);
            
            if (t.kind == TokenKind.Identifier) {
                printf("Kind: Identifier\\n");
            } else {
                printf("Kind: Unknown\\n");
            }
            
            printf("Text: %s\\n", t.text.cstr());
            printf("File: %s\\n", t.span.file.cstr());
            
            t.destroy();
            span.destroy();
            return 0;
        }
        `;
    const result = runBpl(program, "token_test");
    if (result.exitCode !== 0) console.error(result.stderr);
    expect(result.stdout).toContain("Kind: Identifier");
    expect(result.stdout).toContain("Text: myVar");
    expect(result.stdout).toContain("File: test.bpl");
  });
});

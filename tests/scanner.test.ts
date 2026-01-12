import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";
import * as path from "path";

describe("Scanner", () => {
  it("should scan simple tokens", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    const scannerPath = path.join(srcDir, "scanner.bpl");
    const sourceReaderPath = path.join(srcDir, "source_reader.bpl");
    const tokenPath = path.join(srcDir, "token.bpl");

    const program = `
        import [Scanner] from "${scannerPath}";
        import [SourceManager] from "${sourceReaderPath}";
        import [SourceFile] from "${sourceReaderPath}";
        import [DiagnosticReporter] from "std/diagnostics.bpl";
        import [Token] from "${tokenPath}";
        import [TokenKind] from "${tokenPath}";
        import [String] from "std/string.bpl";
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
            local sm: SourceManager = SourceManager.new();
            local content: string = "frame x = 10 + 20;";
            local idx: int = sm.addFile("test.bpl", content);
            local sf: *SourceFile = sm.getFile(idx);
            local reporter: DiagnosticReporter = DiagnosticReporter.new();
            
            local scanner: Scanner = Scanner.new(sf, &reporter);
            
            local t: Token = scanner.next();
            printToken(&t); # frame (KwFrame)
            t.destroy();
            
            t = scanner.next();
            printToken(&t); # x (Identifier)
            t.destroy();
            
            t = scanner.next();
            printToken(&t); # = (Assign)
            t.destroy();
            
            t = scanner.next();
            printToken(&t); # 10 (Number)
            t.destroy();

            reporter.destroy();
            sm.destroy();
            return 0;
        }
        
        frame printToken(t: *Token) {
            local kindName: string = "Unknown";
            if (t.kind == TokenKind.Identifier) kindName = "Identifier";
            if (t.kind == TokenKind.Number) kindName = "Number";
            if (t.kind == TokenKind.Assign) kindName = "Assign";
            if (t.kind == TokenKind.Plus) kindName = "Plus";
            if (t.kind == TokenKind.Semicolon) kindName = "Semicolon";
            if (t.kind == TokenKind.KwFrame) kindName = "KwFrame";
            
            printf("Token: %s '%s'\\n", kindName, t.text.cstr());
        }
        `;
    const result = runBpl(program, "scanner_test");
    if (result.exitCode !== 0) console.error(result.stderr);
    expect(result.stdout).toContain("Token: KwFrame 'frame'");
    expect(result.stdout).toContain("Token: Identifier 'x'");
    expect(result.stdout).toContain("Token: Assign '='");
    expect(result.stdout).toContain("Token: Number '10'");
  });
});

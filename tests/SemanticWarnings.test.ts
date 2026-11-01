import { describe, expect, it } from "bun:test";

import { DiagnosticFormatter } from "../compiler/common/DiagnosticFormatter";
import { DiagnosticSeverity } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return {
    errors: typeChecker.getErrors(),
    warnings: typeChecker.getWarnings(),
  };
}

describe("Semantic warnings", () => {
  it("warns that converting an integer to bool keeps only its low bit", () => {
    const result = check(`
      frame main() ret int {
        local n: int = 2;
        local flags: u8 = cast<u8>(6);
        local a: bool = cast<bool>(n);
        local b: bool = (flags as bool);
        local one: bool = cast<bool>(1);
        local zero: bool = (0 as bool);
        local same: bool = cast<bool>(a);
        if (a || b || one || zero || same) {
          return 1;
        }
        return 0;
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map((warning) => warning.message)).toEqual([
      "Converting i32 to bool keeps only its lowest bit",
      "Converting u8 to bool keeps only its lowest bit",
    ]);
    expect(result.warnings[0]!.toDiagnostic().severity).toBe(
      DiagnosticSeverity.Warning,
    );
    expect(result.warnings[0]!.hint).toContain("!= 0");
  });

  it("warns when a block local shadows an outer local", () => {
    const result = check(`
      frame main() ret int {
        local value: int = 1;
        local total: int = value;
        {
          local value: int = 2;
          total = total + value;
        }
        return total;
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.toDiagnostic().severity).toBe(
      DiagnosticSeverity.Warning,
    );
    expect(result.warnings[0]!.message).toContain(
      "shadows variable from an outer scope",
    );
    expect(result.warnings[0]!.relatedLocations).toHaveLength(1);
  });

  it("warns when a local shadows a function parameter", () => {
    const result = check(`
      frame identity(value: int) ret int {
        local total: int = value;
        {
          local value: int = 2;
          total = total + value;
        }
        return total;
      }
    `);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain(
      "shadows parameter from an outer scope",
    );
  });

  it("keeps same-scope redeclarations as errors", () => {
    const result = check(`
      frame main() ret int {
        local value: int = 1;
        local value: int = 2;
        return value;
      }
    `);

    expect(result.errors.map((error) => error.message).join("\n")).toContain(
      "already declared in this scope",
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("formats stored warning severity by default", () => {
    const result = check(`
      frame main() ret int {
        local value: int = 1;
        local total: int = value;
        {
          local value: int = 2;
          total = total + value;
        }
        return total;
      }
    `);

    const formatter = new DiagnosticFormatter({
      colorize: false,
      showCodeSnippets: false,
    });

    expect(formatter.formatError(result.warnings[0]!)).toContain("warning[");
    expect(formatter.formatErrors(result.warnings)).toContain("1 warning");
  });
});

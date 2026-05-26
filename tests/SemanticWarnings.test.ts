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

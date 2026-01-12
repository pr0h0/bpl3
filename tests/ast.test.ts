import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";
import * as path from "path";

describe("AST Module", () => {
  it("should compile the AST module definitions", () => {
    // We create a small program that imports ast.bpl to verify it compiles and links
    const srcDir = path.resolve(process.cwd(), "src");
    const astPath = path.join(srcDir, "ast.bpl");

    const code = `
      import [Node] from "${astPath}";
      import [NodeKind] from "${astPath}";
      import [BinaryExpr] from "${astPath}";
      import [IdentifierExpr] from "${astPath}";
      import [Expression] from "${astPath}";
      
      # Use relative import for diagnostics or pass it from JS, but here we can just target src/diagnostics.bpl
      import [Span] from "std/diagnostics.bpl";
      
      import [String] from "std/string.bpl";

      frame main() ret int {
         local kind: NodeKind = NodeKind.BinaryExpr;
         local span: Span;
         local ident: IdentifierExpr;
         ident.kind = NodeKind.IdentifierExpr;
         ident.span = span; # Use span
         ident.name = String.new("test");
         
         local binExpr: BinaryExpr;
         binExpr.kind = kind;
         binExpr.left = cast<*Expression>(null); # Basic check
         
         if (binExpr.kind == NodeKind.BinaryExpr) {
             return 0;
         }
         return 1;
      }
    `;

    // Attempt to compile
    const result = runBpl(code, "ast_module_test");
    if (result.exitCode !== 0) {
      console.log(result.stderr);
    }
    expect(result.exitCode).toBe(0);
  });
});

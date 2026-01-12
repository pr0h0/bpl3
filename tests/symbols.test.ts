import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";
import * as path from "path";

describe("Symbol Table", () => {
  it("should compile and link symbol table usage", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    const symbolsPath = path.join(srcDir, "symbols.bpl");
    const astPath = path.join(srcDir, "ast.bpl");

    const code = `
        import [SymbolTable] from "${symbolsPath}";
        import [Symbol] from "${symbolsPath}";
        import [SymbolKind] from "${symbolsPath}";
        import [String] from "std/string.bpl";
        import [Node] from "${astPath}";
        
        frame main() ret int {
            local st: SymbolTable = SymbolTable.new();
            st.enterScope();
            
            # Since new() is not fully implemented to alloc, this part is just verifying compilation/linking of calls
            local name: String = String.new("myVar");
            local sym: *Symbol = Symbol.new(name, SymbolKind.Variable, null);
            
            if (sym != nullptr) {
                st.define(sym);
                local resolved: *Symbol = st.resolve(name);
                if (resolved != nullptr) {
                    # Do nothing
                }
            }
            
            st.exitScope();
            st.destroy();
            return 0;
        }
    `;

    const result = runBpl(code, "symbol_table_test");
    if (result.exitCode !== 0) console.error(result.stderr);
    expect(result.exitCode).toBe(0);
  });
});

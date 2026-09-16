import type * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";
import type { SymbolTable } from "../SymbolTable";

export const EXPORT_SYMBOL_NOT_FOUND_CODE = "BPL_EXPORT_SYMBOL_NOT_FOUND";

/** Run after all module declarations, including globals, have been checked. */
export function validateModuleExports(
  program: AST.Program,
  scope: SymbolTable,
  report: (error: CompilerError) => void = (error) => {
    throw error;
  },
): void {
  for (const statement of program.statements) {
    if (statement.kind !== "Export") continue;
    for (const item of statement.items) {
      if (scope.resolve(item.name)) continue;
      report(
        new CompilerError(
          `Cannot export undefined symbol '${item.name}'`,
          "Declare or import the symbol in this module before exporting it.",
          statement.location,
          EXPORT_SYMBOL_NOT_FOUND_CODE,
        ),
      );
    }
  }
}

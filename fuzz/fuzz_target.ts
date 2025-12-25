import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CompilerError } from "../compiler/common/CompilerError";

/**
 * Fuzz target function.
 * Returns true if the compiler handled the input gracefully (success or expected error).
 * Returns false if the compiler crashed (unexpected exception).
 */
export function fuzzCompiler(source: string): boolean {
  try {
    // 1. Lexing
    let tokens: any[] = [];
    try {
      tokens = lexWithGrammar(source, "fuzz.bpl");
    } catch (e) {
      // Lexer errors are expected
    }

    // 2. Parsing
    const parser = new Parser(source, "fuzz.bpl", tokens);
    let ast;
    try {
      ast = parser.parse(true);
    } catch (e) {
      if (e instanceof CompilerError) {
        return true; // Expected error
      }
      // Check if it's an array of CompilerErrors (Parser sometimes throws list)
      if (Array.isArray(e) && e.length > 0 && e[0] instanceof CompilerError) {
        return true;
      }
      console.error("Parser Crash:", e);
      return false; // Crash
    }

    // 3. Type Checking
    const typeChecker = new TypeChecker({
      skipImportResolution: true, // Skip imports for fuzzing to avoid FS access
    });

    try {
      typeChecker.checkProgram(ast);
    } catch (e) {
      if (e instanceof CompilerError) {
        return true; // Expected error
      }
      if (Array.isArray(e) && e.length > 0 && e[0] instanceof CompilerError) {
        return true;
      }
      console.error("TypeChecker Crash:", e);
      return false; // Crash
    }

    return true; // Success (valid code)
  } catch (e) {
    console.error("Unexpected Crash:", e);
    return false;
  }
}

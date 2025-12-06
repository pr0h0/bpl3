import type { IParser } from "../IParser";
import { CompilerError } from "../../errors";
import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import ExportExpr from "../expression/exportExpr";
import ExternDeclarationExpr from "../expression/externDeclarationExpr";
import FunctionDeclarationExpr from "../expression/functionDeclaration";
import ImportExpr from "../expression/importExpr";
import StructDeclarationExpr, {
  type StructField,
} from "../expression/structDeclarationExpr";
import VariableDeclarationExpr, {
  type VariableType,
} from "../expression/variableDeclarationExpr";

export class DeclarationParser {
  constructor(private parser: IParser) {}

  parseVariableDeclaration(): VariableDeclarationExpr {
    return this.parser.withRange(() => {
      const scopeToken = this.parser.consume(TokenType.IDENTIFIER);
      let isConst = false;
      if (
        this.parser.peek() &&
        this.parser.peek()!.type === TokenType.IDENTIFIER &&
        this.parser.peek()!.value === "const"
      ) {
        this.parser.consume(TokenType.IDENTIFIER);
        isConst = true;
      }
      const varNameToken = this.parser.consume(TokenType.IDENTIFIER);
      this.parser.consume(TokenType.COLON, "Expected ':' after variable name.");

      const typeToken = this.parser.parseType();

      if (this.parser.peek() && this.parser.peek()!.type !== TokenType.ASSIGN) {
        if (isConst) {
          throw new CompilerError(
            `Constant variable '${varNameToken.value}' must be initialized.`,
            varNameToken.line,
          );
        }
        return new VariableDeclarationExpr(
          scopeToken.value as "global" | "local",
          isConst,
          varNameToken.value,
          typeToken,
          null,
          varNameToken,
        );
      }

      this.parser.consume(
        TokenType.ASSIGN,
        "Expected '=' after variable type.",
      );
      const initializer = this.parser.parseTernary();
      return new VariableDeclarationExpr(
        scopeToken.value as "global" | "local",
        isConst,
        varNameToken.value,
        typeToken,
        initializer,
        varNameToken,
      );
    });
  }

  parseFunctionDeclaration(): FunctionDeclarationExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      const funcNameToken = this.parser.consume(TokenType.IDENTIFIER);

      // Parse generic parameters if present
      const genericParams: string[] = [];
      if (this.parser.peek()?.type === TokenType.LESS_THAN) {
        this.parser.consume(TokenType.LESS_THAN);

        do {
          const paramToken = this.parser.consume(
            TokenType.IDENTIFIER,
            "Expected generic parameter name",
          );
          genericParams.push(paramToken.value);

          if (this.parser.peek()?.type === TokenType.COMMA) {
            this.parser.consume(TokenType.COMMA);
          } else if (this.parser.peek()?.type === TokenType.GREATER_THAN) {
            break;
          } else {
            throw new CompilerError(
              "Expected ',' or '>' in generic parameter list",
              this.parser.peek()?.line || 0,
            );
          }
        } while (true);

        this.parser.consume(
          TokenType.GREATER_THAN,
          "Expected '>' after generic parameters",
        );
      }

      const args: { type: VariableType; name: string }[] = [];
      this.parser.consume(
        TokenType.OPEN_PAREN,
        "Expected '(' after 'frame' function name.",
      );

      let isVariadic = false;
      let variadicType: VariableType | null = null;

      while (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.CLOSE_PAREN
      ) {
        if (this.parser.peek()?.type === TokenType.ELLIPSIS) {
          this.parser.consume(TokenType.ELLIPSIS);
          this.parser.consume(TokenType.COLON, "Expected ':' after '...'");
          variadicType = this.parser.parseType();
          isVariadic = true;

          if (this.parser.peek()?.type === TokenType.COMMA) {
            throw new CompilerError(
              "Variadic argument must be the last argument",
              this.parser.peek()?.line || 0,
            );
          }
          break;
        }

        const argNameToken = this.parser.consume(TokenType.IDENTIFIER);
        this.parser.consume(
          TokenType.COLON,
          "Expected ':' after argument name.",
        );

        const argType: VariableType = this.parser.parseType();

        args.push({
          name: argNameToken.value,
          type: argType,
        });

        if (
          this.parser.peek()?.type !== TokenType.CLOSE_PAREN &&
          this.parser.peek()?.type !== TokenType.COMMA &&
          this.parser.peek(1)!.type !== TokenType.CLOSE_PAREN
        ) {
          throw new CompilerError(
            "Expected ',' or ')' after function argument but got '" +
              (this.parser.peek()?.value || "") +
              "'",
            this.parser.peek()?.line || 0,
          );
        }

        if (
          this.parser.peek() &&
          this.parser.peek()!.type === TokenType.COMMA
        ) {
          this.parser.consume(TokenType.COMMA);
        }
      }

      this.parser.consume(
        TokenType.CLOSE_PAREN,
        "Expected ')' after function arguments.",
      );

      let returnType: VariableType | null = null;
      if (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.OPEN_BRACE
      ) {
        const retToken = this.parser.consume(
          TokenType.IDENTIFIER,
          "Expected ret keyword after function arguments.",
        );
        if (retToken.value !== "ret") {
          throw new CompilerError(
            "Expected 'ret' keyword, but got '" + retToken.value + "'",
            retToken.line,
          );
        }
        returnType = this.parser.parseType();
      }

      const body = this.parser.parseCodeBlock();

      return new FunctionDeclarationExpr(
        funcNameToken.value,
        args,
        returnType,
        body,
        funcNameToken,
        isVariadic,
        variadicType,
        genericParams,
      );
    });
  }

  parseStructDeclaration(): StructDeclarationExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      const structNameToken = this.parser.consume(TokenType.IDENTIFIER);

      const genericParams: string[] = [];
      if (this.parser.peek()?.type === TokenType.LESS_THAN) {
        this.parser.consume(TokenType.LESS_THAN);
        while (
          this.parser.peek() &&
          this.parser.peek()!.type !== TokenType.GREATER_THAN
        ) {
          const paramName = this.parser.consume(
            TokenType.IDENTIFIER,
            "Expected generic parameter name.",
          );
          genericParams.push(paramName.value);
          if (this.parser.peek()?.type === TokenType.COMMA) {
            this.parser.consume(TokenType.COMMA);
          }
        }
        this.parser.consume(
          TokenType.GREATER_THAN,
          "Expected '>' after generic parameters.",
        );
      }

      let parent: string | null = null;
      if (this.parser.peek()?.type === TokenType.COLON) {
        this.parser.consume(TokenType.COLON);
        parent = this.parser.consume(
          TokenType.IDENTIFIER,
          "Expected parent struct name.",
        ).value;
      }

      this.parser.consume(
        TokenType.OPEN_BRACE,
        "Expected '{' after struct name.",
      );

      const fields: StructField[] = [];
      while (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.CLOSE_BRACE
      ) {
        // Check if this is a method declaration (starts with 'frame')
        if (this.parser.peek()?.value === "frame") {
          break; // Exit field parsing, start method parsing
        }

        const fieldNameToken = this.parser.consume(TokenType.IDENTIFIER);
        this.parser.consume(TokenType.COLON, "Expected ':' after field name.");

        const fieldTypeToken = this.parser.parseType();

        if (
          this.parser.peek() &&
          this.parser.peek()!.type === TokenType.COMMA
        ) {
          this.parser.consume(TokenType.COMMA);
        }

        fields.push({
          name: fieldNameToken.value,
          type: fieldTypeToken,
          token: fieldNameToken,
        });
      }

      // Parse methods
      const methods: FunctionDeclarationExpr[] = [];
      while (this.parser.peek() && this.parser.peek()?.value === "frame") {
        const method = this.parseFunctionDeclaration();
        // Tag this as a method with metadata
        method.isMethod = true;
        method.receiverStruct = structNameToken.value;
        methods.push(method);
      }

      this.parser.consume(
        TokenType.CLOSE_BRACE,
        "Expected '}' after struct fields.",
      );

      return new StructDeclarationExpr(
        structNameToken.value,
        fields,
        genericParams,
        methods,
        parent,
      );
    });
  }

  parseExternDeclaration(): ExternDeclarationExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER); // consume 'extern'
      const funcNameToken = this.parser.consume(TokenType.IDENTIFIER);
      const args: { type: VariableType; name: string }[] = [];
      this.parser.consume(
        TokenType.OPEN_PAREN,
        "Expected '(' after 'extern' function name.",
      );

      let isVariadic = false;

      while (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.CLOSE_PAREN
      ) {
        if (this.parser.peek()?.type === TokenType.ELLIPSIS) {
          this.parser.consume(TokenType.ELLIPSIS);
          isVariadic = true;
          // Ellipsis must be the last argument
          if (this.parser.peek()?.type === TokenType.COMMA) {
            throw new CompilerError(
              "Variadic argument '...' must be the last argument.",
              this.parser.peek()?.line || 0,
            );
          }
          break;
        }

        const argNameToken = this.parser.consume(TokenType.IDENTIFIER);
        this.parser.consume(
          TokenType.COLON,
          "Expected ':' after argument name.",
        );

        const argType: VariableType = this.parser.parseType();

        args.push({
          name: argNameToken.value,
          type: argType,
        });

        if (
          this.parser.peek()?.type !== TokenType.CLOSE_PAREN &&
          this.parser.peek()?.type !== TokenType.COMMA
        ) {
          throw new CompilerError(
            "Expected ',' or ')' after function argument",
            this.parser.peek()?.line || 0,
          );
        }

        if (
          this.parser.peek() &&
          this.parser.peek()!.type === TokenType.COMMA
        ) {
          this.parser.consume(TokenType.COMMA);
        }
      }

      this.parser.consume(
        TokenType.CLOSE_PAREN,
        "Expected ')' after function arguments.",
      );

      let returnType: VariableType | null = null;
      if (
        this.parser.peek() &&
        this.parser.peek()!.type !== TokenType.SEMICOLON
      ) {
        const retToken = this.parser.consume(
          TokenType.IDENTIFIER,
          "Expected ret keyword or semicolon after function arguments.",
        );
        if (retToken.value === "ret") {
          returnType = this.parser.parseType();
        } else {
          throw new CompilerError(
            "Expected 'ret' keyword, but got '" + retToken.value + "'",
            retToken.line,
          );
        }
      }

      return new ExternDeclarationExpr(
        funcNameToken.value,
        args,
        returnType,
        isVariadic,
      );
    });
  }

  parseImportExpression(): ImportExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      const importNames: {
        name: string;
        type: "type" | "function";
        token?: Token;
      }[] = [];

      while (
        (this.parser.peek()?.type === TokenType.IDENTIFIER ||
          this.parser.peek()?.type === TokenType.OPEN_BRACKET) &&
        this.parser.peek()?.value !== "from"
      ) {
        if (this.parser.peek()?.type === TokenType.OPEN_BRACKET) {
          this.parser.consume(TokenType.OPEN_BRACKET);
          const importNameToken = this.parser.consume(TokenType.IDENTIFIER);
          this.parser.consume(TokenType.CLOSE_BRACKET);
          importNames.push({
            name: importNameToken.value,
            type: "type",
            token: importNameToken,
          });
        } else {
          const importNameToken = this.parser.consume(TokenType.IDENTIFIER);
          importNames.push({
            name: importNameToken.value,
            type: "function",
            token: importNameToken,
          });
        }
        if (this.parser.peek()?.type === TokenType.COMMA) {
          this.parser.consume(TokenType.COMMA);
        } else if (
          this.parser.peek()?.type === TokenType.IDENTIFIER &&
          this.parser.peek()?.value !== "from"
        ) {
          throw new CompilerError(
            "Expected ',' between imports",
            this.parser.peek()?.line || 0,
          );
        }
      }

      if (importNames.length === 0) {
        throw new CompilerError(
          "Expected at least one import name after 'import'",
          this.parser.peek(-1)?.line || 0,
        );
      }

      let moduleNameToken: Token | null = null;
      if (this.parser.peek()?.value === "from") {
        this.parser.consume(TokenType.IDENTIFIER); // consume 'from'
        const nextToken = this.parser.peek(); // check next token for module name, can be identifier or string literal
        if (
          !nextToken ||
          (nextToken?.type !== TokenType.IDENTIFIER &&
            nextToken.type !== TokenType.STRING_LITERAL)
        ) {
          throw new CompilerError(
            "Expected module name after 'from'",
            this.parser.peek(-1)?.line || 0,
          );
        }
        moduleNameToken = this.parser.consume(nextToken!.type);
      }

      return new ImportExpr(
        moduleNameToken?.value ?? "global",
        importNames,
        moduleNameToken ?? undefined,
      );
    });
  }

  parseExportExpression(): ExportExpr {
    return this.parser.withRange(() => {
      this.parser.consume(TokenType.IDENTIFIER);
      let exportType: "type" | "function" = "function";
      if (this.parser.peek()?.type === TokenType.OPEN_BRACKET) {
        this.parser.consume(TokenType.OPEN_BRACKET);
        exportType = "type";
      }
      const name = this.parser.consume(TokenType.IDENTIFIER);
      if (exportType === "type") {
        this.parser.consume(
          TokenType.CLOSE_BRACKET,
          "Expected ']' after export type.",
        );
      }
      return new ExportExpr(name.value, exportType, name);
    });
  }
}

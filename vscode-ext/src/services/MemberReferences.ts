import { Range } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import type * as AST from "../../../compiler/common/AST";
import { walkAST } from "../../../compiler/common/ASTTraversal";
import { lexWithGrammar } from "../../../compiler/frontend/GrammarLexer";
import { TokenType } from "../../../compiler/frontend/TokenType";
import type { Token } from "../../../compiler/frontend/Token";

/** Resolves an expression to its type name, such as `Counter` or `*Counter`. */
export type ExpressionTypeResolver = (expr: AST.Expression) => string | null;

interface MemberTarget {
  /** The struct that declares the member. */
  owner: AST.StructDecl;
  declaration: AST.StructField | AST.FunctionDecl;
  name: string;
}

/**
 * Ranges of every reference in `program` to the struct field or method at
 * `node`: its declaration name, `value.member` accesses whose object is that
 * struct or a struct inheriting it, and keys in struct literals. Returns null
 * when `node` is not a field, a method, or a member access that resolves to
 * one declared in this file. `cursorOffset` selects the key when `node` is a
 * struct literal, whose field keys have no AST locations.
 */
export function findMemberReferences(
  program: AST.Program,
  node: AST.ASTNode,
  document: TextDocument,
  typeOf: ExpressionTypeResolver,
  cursorOffset?: number,
): Range[] | null {
  const structs = new Map<string, AST.StructDecl>();
  for (const statement of program.statements) {
    if (statement.kind === "StructDecl") {
      structs.set(
        (statement as AST.StructDecl).name,
        statement as AST.StructDecl,
      );
    }
  }
  const target = memberTarget(node, structs, typeOf, document, cursorOffset);
  if (!target) return null;

  const ranges: Range[] = [];
  const declarationRange =
    target.declaration.kind === "FunctionDecl"
      ? nameRange(target.declaration, target.name, document, TokenType.Frame)
      : nameRange(target.declaration, target.name, document);
  if (declarationRange) ranges.push(declarationRange);

  walkAST(
    program,
    (current) => {
      if (current.kind === "Member") {
        const member = current as AST.MemberExpr;
        if (member.property !== target.name) return;
        const struct = structOf(member.object, structs, typeOf);
        if (!struct || !inherits(struct, target.owner, structs)) return;
        const range = lastNameRange(member, target.name, document);
        if (range) ranges.push(range);
      } else if (
        current.kind === "StructLiteral" &&
        target.declaration.kind === "StructField"
      ) {
        const literal = current as AST.StructLiteralExpr;
        const struct = structs.get(baseName(literal.structName));
        if (!struct || !inherits(struct, target.owner, structs)) return;
        if (!literal.fields.some((field) => field.name === target.name)) return;
        ranges.push(...literalKeyRanges(literal, target.name, document));
      }
    },
    { trackPath: false },
  );
  return ranges;
}

function memberTarget(
  node: AST.ASTNode,
  structs: Map<string, AST.StructDecl>,
  typeOf: ExpressionTypeResolver,
  document: TextDocument,
  cursorOffset: number | undefined,
): MemberTarget | null {
  if (node.kind === "StructLiteral") {
    if (cursorOffset === undefined) return null;
    const literal = node as AST.StructLiteralExpr;
    const key = literal.fields.find((field) =>
      literalKeyRanges(literal, field.name, document).some(
        (range) =>
          cursorOffset >= document.offsetAt(range.start) &&
          cursorOffset <= document.offsetAt(range.end),
      ),
    );
    if (!key) return null;
    return declaringMember(
      structs.get(baseName(literal.structName)) ?? null,
      key.name,
      structs,
    );
  }
  if (node.kind === "StructField" || node.kind === "FunctionDecl") {
    for (const struct of structs.values()) {
      if ((struct.members as AST.ASTNode[]).includes(node)) {
        return {
          owner: struct,
          declaration: node as AST.StructField | AST.FunctionDecl,
          name: (node as AST.StructField | AST.FunctionDecl).name,
        };
      }
    }
    return null;
  }
  if (node.kind !== "Member") return null;
  const member = node as AST.MemberExpr;
  return declaringMember(
    structOf(member.object, structs, typeOf),
    member.property,
    structs,
  );
}

/** Walks up the inheritance chain to the struct declaring `name`. */
function declaringMember(
  start: AST.StructDecl | null,
  name: string,
  structs: Map<string, AST.StructDecl>,
): MemberTarget | null {
  for (let struct = start; struct; struct = parentOf(struct, structs)) {
    const declaration = struct.members.find(
      (candidate) => candidate.name === name,
    );
    if (declaration) return { owner: struct, declaration, name };
  }
  return null;
}

/** The struct an expression's value is, or points to; `Type.method` names one. */
function structOf(
  expr: AST.Expression,
  structs: Map<string, AST.StructDecl>,
  typeOf: ExpressionTypeResolver,
): AST.StructDecl | null {
  if (expr.kind === "Identifier") {
    const named = structs.get((expr as AST.IdentifierExpr).name);
    if (named) return named;
  }
  const type = typeOf(expr);
  return type ? (structs.get(baseName(type)) ?? null) : null;
}

function baseName(type: string): string {
  return type
    .replace(/^\*+/, "")
    .replace(/<.*$/, "")
    .replace(/\[.*$/, "")
    .trim();
}

function parentOf(
  struct: AST.StructDecl,
  structs: Map<string, AST.StructDecl>,
): AST.StructDecl | null {
  const first = struct.inheritanceList[0];
  if (!first || first.kind !== "BasicType") return null;
  return structs.get((first as AST.BasicTypeNode).name) ?? null;
}

function inherits(
  struct: AST.StructDecl,
  ancestor: AST.StructDecl,
  structs: Map<string, AST.StructDecl>,
): boolean {
  const seen = new Set<AST.StructDecl>();
  for (
    let current: AST.StructDecl | null = struct;
    current && !seen.has(current);
    current = parentOf(current, structs)
  ) {
    if (current === ancestor) return true;
    seen.add(current);
  }
  return false;
}

function nodeTokens(
  node: AST.ASTNode,
  document: TextDocument,
): { tokens: Token[]; location: NonNullable<AST.ASTNode["location"]> } | null {
  const location = node.location;
  if (!location) return null;
  const text = document.getText(
    Range.create(
      location.startLine - 1,
      location.startColumn - 1,
      location.endLine - 1,
      location.endColumn - 1,
    ),
  );
  try {
    return {
      tokens: lexWithGrammar(text, fileURLToPath(document.uri)),
      location,
    };
  } catch {
    return null;
  }
}

function tokenRange(
  token: Token,
  location: NonNullable<AST.ASTNode["location"]>,
  name: string,
): Range {
  const line = location.startLine + token.line - 2;
  const character =
    token.column - 1 + (token.line === 1 ? location.startColumn - 1 : 0);
  return Range.create(line, character, line, character + name.length);
}

/** The first identifier `name`, after `keyword` when one is given. */
function nameRange(
  node: AST.ASTNode,
  name: string,
  document: TextDocument,
  keyword?: TokenType,
): Range | null {
  const lexed = nodeTokens(node, document);
  if (!lexed) return null;
  const start =
    keyword === undefined
      ? 0
      : lexed.tokens.findIndex((token) => token.type === keyword) + 1;
  const token = lexed.tokens
    .slice(start)
    .find((candidate) => candidate.type === TokenType.Identifier);
  return token && token.lexeme === name
    ? tokenRange(token, lexed.location, name)
    : null;
}

/** The property of `object.name`: the last identifier `name` in the node. */
function lastNameRange(
  node: AST.MemberExpr,
  name: string,
  document: TextDocument,
): Range | null {
  const lexed = nodeTokens(node, document);
  if (!lexed) return null;
  for (let i = lexed.tokens.length - 1; i >= 0; i--) {
    const token = lexed.tokens[i]!;
    if (token.type === TokenType.Identifier && token.lexeme === name) {
      return tokenRange(token, lexed.location, name);
    }
  }
  return null;
}

/** `name:` keys directly inside a struct literal's braces. */
function literalKeyRanges(
  literal: AST.StructLiteralExpr,
  name: string,
  document: TextDocument,
): Range[] {
  const lexed = nodeTokens(literal, document);
  if (!lexed) return [];
  const ranges: Range[] = [];
  // A key directly follows the literal's `{` or a `,` at its top level, so a
  // `name:` inside a value (`flag ? name : 0`, `|name: int|`) is not one.
  const tokens = lexed.tokens.filter(
    (token) => token.type !== TokenType.Comment,
  );
  let depth = 0;
  tokens.forEach((token, index) => {
    switch (token.type) {
      case TokenType.LeftBrace:
      case TokenType.LeftParen:
      case TokenType.LeftBracket:
        depth++;
        return;
      case TokenType.RightBrace:
      case TokenType.RightParen:
      case TokenType.RightBracket:
        depth--;
        return;
    }
    const previous = tokens[index - 1]?.type;
    if (
      depth === 1 &&
      token.type === TokenType.Identifier &&
      token.lexeme === name &&
      (previous === TokenType.LeftBrace || previous === TokenType.Comma) &&
      tokens[index + 1]?.type === TokenType.Colon
    ) {
      ranges.push(tokenRange(token, lexed.location, name));
    }
  });
  return ranges;
}

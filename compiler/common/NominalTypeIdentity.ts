import type * as AST from "./AST";

/** Nominal declarations can be reparsed by separate import graphs. Compare
 * their source identity as well as object identity, rather than a bare name.
 */
export function haveDistinctNominalDeclarations(
  left: AST.BasicTypeNode,
  right: AST.BasicTypeNode,
): boolean {
  const a = left.resolvedDeclaration;
  const b = right.resolvedDeclaration;
  if (!a || !b || a === b) return false;
  const nominal = (node: AST.ASTNode) =>
    node.kind === "StructDecl" ||
    node.kind === "EnumDecl" ||
    node.kind === "SpecDecl";
  if (!nominal(a) || !nominal(b)) return false;
  return (
    a.kind !== b.kind ||
    a.location.file !== b.location.file ||
    a.location.startLine !== b.location.startLine ||
    a.location.startColumn !== b.location.startColumn
  );
}

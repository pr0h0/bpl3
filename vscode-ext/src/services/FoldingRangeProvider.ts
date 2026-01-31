import {
  type FoldingRangeParams,
  FoldingRange,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";

/**
 * Provides smart code folding based on AST structure.
 * Allows folding functions, structs, blocks, imports, etc.
 */
export class FoldingRangeProvider {
  constructor(private astResolver: ASTResolver) {}

  /**
   * Handle folding range request
   */
  handle(
    params: FoldingRangeParams,
    document: TextDocument,
  ): FoldingRange[] | null {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    const ranges: FoldingRange[] = [];

    // Collect folding ranges from all statements
    for (const stmt of ast.statements) {
      this.collectFoldingRanges(stmt, ranges);
    }

    // Add import region folding
    this.addImportRegion(ast, ranges);

    return ranges.length > 0 ? ranges : null;
  }

  /**
   * Collect folding ranges from AST nodes
   */
  private collectFoldingRanges(
    node: AST.Statement | AST.Expression,
    ranges: FoldingRange[],
  ): void {
    if (!node.location) return;

    const { startLine, endLine } = node.location;

    // Only create folding range if it spans multiple lines
    if (endLine - startLine > 0) {
      switch (node.kind) {
        case "FunctionDecl":
          // Fold function body
          const func = node as AST.FunctionDecl;
          if (func.body && func.body.location) {
            ranges.push(
              FoldingRange.create(
                func.body.location.startLine - 1,
                func.body.location.endLine - 1,
                undefined,
                undefined,
                "region",
              ),
            );
          }
          break;

        case "StructDecl":
          // Fold struct body
          ranges.push(
            FoldingRange.create(
              startLine - 1,
              endLine - 1,
              undefined,
              undefined,
              "region",
            ),
          );
          break;

        case "EnumDecl":
          // Fold enum body
          ranges.push(
            FoldingRange.create(
              startLine - 1,
              endLine - 1,
              undefined,
              undefined,
              "region",
            ),
          );
          break;

        case "Block":
          // Fold blocks (if, loop, match arms, etc.)
          ranges.push(
            FoldingRange.create(
              startLine - 1,
              endLine - 1,
              undefined,
              undefined,
              "region",
            ),
          );
          break;

        case "Switch":
          // Fold match statement
          const match = node as AST.SwitchStmt;
          ranges.push(
            FoldingRange.create(
              startLine - 1,
              endLine - 1,
              undefined,
              undefined,
              "region",
            ),
          );
          // Fold individual match arms
          for (const arm of match.cases) {
            if (arm.body.location) {
              const armStart = arm.body.location.startLine - 1;
              const armEnd = arm.body.location.endLine - 1;
              if (armEnd > armStart) {
                ranges.push(
                  FoldingRange.create(
                    armStart,
                    armEnd,
                    undefined,
                    undefined,
                    "region",
                  ),
                );
              }
            }
          }
          break;

        case "Try":
          // Fold try-catch blocks
          const tryCatch = node as AST.TryStmt;
          if (tryCatch.tryBlock.location) {
            ranges.push(
              FoldingRange.create(
                tryCatch.tryBlock.location.startLine - 1,
                tryCatch.tryBlock.location.endLine - 1,
                undefined,
                undefined,
                "region",
              ),
            );
          }
          for (const catchClause of tryCatch.catchClauses) {
            if (catchClause.body.location) {
              ranges.push(
                FoldingRange.create(
                  catchClause.body.location.startLine - 1,
                  catchClause.body.location.endLine - 1,
                  undefined,
                  undefined,
                  "region",
                ),
              );
            }
          }
          break;

        case "If":
          // Fold if/else blocks
          const ifStmt = node as AST.IfStmt;
          if (ifStmt.thenBranch.location) {
            const thenStart = ifStmt.thenBranch.location.startLine - 1;
            const thenEnd = ifStmt.thenBranch.location.endLine - 1;
            if (thenEnd > thenStart) {
              ranges.push(
                FoldingRange.create(
                  thenStart,
                  thenEnd,
                  undefined,
                  undefined,
                  "region",
                ),
              );
            }
          }
          if (ifStmt.elseBranch && ifStmt.elseBranch.location) {
            const elseStart = ifStmt.elseBranch.location.startLine - 1;
            const elseEnd = ifStmt.elseBranch.location.endLine - 1;
            if (elseEnd > elseStart) {
              ranges.push(
                FoldingRange.create(
                  elseStart,
                  elseEnd,
                  undefined,
                  undefined,
                  "region",
                ),
              );
            }
          }
          break;

        case "Loop":
          // Fold loop body
          const loop = node as AST.LoopStmt;
          if (loop.body.location) {
            ranges.push(
              FoldingRange.create(
                loop.body.location.startLine - 1,
                loop.body.location.endLine - 1,
                undefined,
                undefined,
                "region",
              ),
            );
          }
          break;
      }
    }

    // Recursively process children
    const children = this.getChildNodes(node);
    for (const child of children) {
      this.collectFoldingRanges(child, ranges);
    }
  }

  /**
   * Add folding range for consecutive import statements
   */
  private addImportRegion(ast: AST.Program, ranges: FoldingRange[]): void {
    let firstImportLine: number | null = null;
    let lastImportLine: number | null = null;

    for (const stmt of ast.statements) {
      if (stmt.kind === "Import" && stmt.location) {
        const line = stmt.location.startLine - 1;
        if (firstImportLine === null) {
          firstImportLine = line;
        }
        lastImportLine = line;
      } else if (firstImportLine !== null) {
        // Break on first non-import
        break;
      }
    }

    // Create import folding range if there are multiple imports
    if (
      firstImportLine !== null &&
      lastImportLine !== null &&
      lastImportLine > firstImportLine
    ) {
      ranges.push(
        FoldingRange.create(
          firstImportLine,
          lastImportLine,
          undefined,
          undefined,
          "imports",
        ),
      );
    }
  }

  /**
   * Get child nodes for traversal
   */
  private getChildNodes(
    node: AST.Statement | AST.Expression,
  ): (AST.Statement | AST.Expression)[] {
    const children: (AST.Statement | AST.Expression)[] = [];

    switch (node.kind) {
      case "FunctionDecl":
        const func = node as AST.FunctionDecl;
        if (func.body) children.push(...func.body.statements);
        break;
      case "StructDecl":
        const structMembers = (node as AST.StructDecl).members;
        if (structMembers) {
          for (const member of structMembers) {
            if (member.kind === "FunctionDecl") {
              children.push(member);
            }
          }
        }
        break;
      case "Block":
        children.push(...(node as AST.BlockStmt).statements);
        break;
      case "If":
        const ifStmt = node as AST.IfStmt;
        children.push(ifStmt.thenBranch);
        if (ifStmt.elseBranch) children.push(ifStmt.elseBranch);
        break;
      case "Loop":
        children.push((node as AST.LoopStmt).body);
        break;
      case "Switch":
        const match = node as AST.SwitchStmt;
        for (const arm of match.cases) {
          children.push(arm.body);
        }
        break;
      case "Try":
        const tryCatch = node as AST.TryStmt;
        children.push(tryCatch.tryBlock);
        for (const catchClause of tryCatch.catchClauses) {
          children.push(catchClause.body);
        }
        break;
    }

    return children;
  }
}

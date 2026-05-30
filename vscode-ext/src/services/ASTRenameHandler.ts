/**
 * AST-based Rename Handler
 * Provides scope-aware symbol renaming
 */

import {
  WorkspaceEdit,
  TextEdit,
  type RenameParams,
  type PrepareRenameParams,
  Range,
  Location,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";
import { debugLog } from "./utils";

export class ASTRenameHandler {
  private static readonly reservedIdentifiers = new Set([
    "global",
    "local",
    "const",
    "type",
    "frame",
    "static",
    "ret",
    "struct",
    "enum",
    "spec",
    "import",
    "from",
    "export",
    "extern",
    "asm",
    "as",
    "this",
    "self",
    "loop",
    "if",
    "else",
    "break",
    "continue",
    "try",
    "catch",
    "return",
    "throw",
    "switch",
    "case",
    "default",
    "fallthrough",
    "cast",
    "sizeof",
    "typeof",
    "offsetof",
    "match",
    "defer",
    "Func",
    "Lambda",
    "null",
    "nullptr",
    "true",
    "false",
  ]);

  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Prepare rename - validate that the symbol can be renamed
   */
  prepareRename(
    params: PrepareRenameParams,
    document: TextDocument,
  ): Range | null {
    try {
      const filePath = fileURLToPath(params.textDocument.uri);
      const line = params.position.line + 1;
      const character = params.position.character;

      // Parse document content
      const content = document.getText();
      this.astResolver.parseDocumentContent(filePath, content);

      // Find the node at the cursor position
      const node = this.findNodeAtPosition(filePath, line, character);
      if (!node) {
        debugLog("[ASTRename] No node found at position");
        return null;
      }

      debugLog(`[ASTRename] prepareRename found node kind: ${node.kind}`);

      // Check if the node is renameable
      if (this.isRenameableNode(node)) {
        debugLog(`[ASTRename] Node is renameable, getting range...`);
        const range = this.getNodeRange(node, document);
        if (range) {
          debugLog(
            `[ASTRename] Range: line ${range.start.line}, char ${range.start.character} to ${range.end.character}`,
          );
        } else {
          debugLog(
            `[ASTRename] WARNING: getNodeRange returned null for ${node.kind}`,
          );
        }
        return range;
      }

      debugLog(`[ASTRename] Node kind ${node.kind} is not renameable`);
      return null;
    } catch (error) {
      console.error("[ASTRename] Error in prepareRename:", error);
      return null;
    }
  }

  /**
   * Execute rename - find all references and create edits
   */
  rename(params: RenameParams, document: TextDocument): WorkspaceEdit | null {
    try {
      if (!this.isValidRenameIdentifier(params.newName)) {
        return null;
      }

      const filePath = fileURLToPath(params.textDocument.uri);
      const line = params.position.line + 1;
      const character = params.position.character;

      // Parse document content
      const content = document.getText();
      this.astResolver.parseDocumentContent(filePath, content);

      // Find the node at the cursor position
      const node = this.findNodeAtPosition(filePath, line, character);
      if (!node) {
        return null;
      }

      // Find all references based on the node type
      const references = this.findReferences(node, filePath, document);

      // Create workspace edit
      const changes: { [uri: string]: TextEdit[] } = {};
      for (const ref of references) {
        if (!changes[ref.uri]) {
          changes[ref.uri] = [];
        }
        const edits = changes[ref.uri];
        if (edits) {
          edits.push(TextEdit.replace(ref.range, params.newName));
        }
      }

      return { changes };
    } catch (error) {
      console.error("[ASTRename] Error in rename:", error);
      return null;
    }
  }

  /**
   * Find all references to the symbol at a given position (for Find All References)
   * This is the same as rename but without creating edits
   */
  findAllReferences(
    position: { line: number; character: number },
    document: TextDocument,
  ): Location[] | null {
    try {
      const filePath = fileURLToPath(document.uri);
      const line = position.line + 1; // Convert to 1-based
      const character = position.character;

      // Parse document content
      const content = document.getText();
      this.astResolver.parseDocumentContent(filePath, content);

      // Find the node at the cursor position
      const node = this.findNodeAtPosition(filePath, line, character);
      if (!node) {
        return null;
      }

      // Find all references based on the node type
      const references = this.findReferences(node, filePath, document);

      return references;
    } catch (error) {
      console.error("[ASTReferences] Error finding references:", error);
      return null;
    }
  }

  private isValidRenameIdentifier(name: string): boolean {
    return (
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
      !ASTRenameHandler.reservedIdentifiers.has(name)
    );
  }

  /**
   * Find all references to a symbol based on its scope
   */
  private findReferences(
    node: AST.ASTNode,
    filePath: string,
    document: TextDocument,
  ): Location[] {
    const references: Location[] = [];

    // Get the symbol name
    const symbolName = this.getSymbolName(node);
    if (!symbolName) return references;

    debugLog(`[ASTRename] Finding references for symbol: ${symbolName}`);

    // Determine the scope and type of the symbol
    const symbolInfo = this.analyzeSymbol(node, filePath);
    if (!symbolInfo) {
      debugLog(
        `[ASTRename] Could not analyze symbol for node kind: ${node.kind}`,
      );
      return references;
    }

    debugLog(
      `[ASTRename] Symbol type: ${symbolInfo.type}, scope: ${symbolInfo.scope}`,
    );

    // Find references based on scope
    switch (symbolInfo.type) {
      case "local-variable":
        // Only rename within the current function
        return this.findLocalVariableReferences(
          symbolName,
          symbolInfo.functionNode!,
          symbolInfo.node,
          document,
        );

      case "parameter":
      case "pattern-binding":
      case "catch-parameter":
        // Only rename within the current function or catch scope
        if (symbolInfo.type === "catch-parameter") {
          const catchClause = this.findContainingCatchClause(
            node,
            this.astResolver.getAST(filePath)!,
          );
          return this.findCatchParameterReferences(
            symbolName,
            catchClause,
            document,
          );
        }
        return this.findParameterReferences(
          symbolName,
          symbolInfo.functionNode!,
          document,
        );

      case "struct-field":
        // Rename all accesses to this field across all files
        return this.findStructFieldReferences(
          symbolName,
          symbolInfo.structName!,
        );

      case "struct-method":
        // Rename all calls to this method across all files
        return this.findStructMethodReferences(
          symbolName,
          symbolInfo.structName!,
        );

      case "function":
      case "struct":
      case "enum":
      case "type-alias":
      case "global-variable":
        // Global symbols - rename across all files
        return this.findGlobalSymbolReferences(symbolName, symbolInfo.type);

      default:
        return references;
    }
  }

  /**
   * Find references to a local variable within its function scope
   * Handles shadowing by tracking scope boundaries
   */
  private findLocalVariableReferences(
    name: string,
    functionNode: AST.FunctionDecl,
    targetDecl: AST.ASTNode,
    document: TextDocument,
  ): Location[] {
    const references: Location[] = [];

    // Find all VariableDecls with this name
    const allDecls: { decl: AST.VariableDecl; parent: AST.ASTNode }[] = [];

    // Helper to find all declarations
    const findAllDecls = (node: AST.ASTNode, parent: AST.ASTNode | null) => {
      if (
        node.kind === "VariableDecl" &&
        typeof (node as AST.VariableDecl).name === "string" &&
        (node as AST.VariableDecl).name === name
      ) {
        allDecls.push({ decl: node as AST.VariableDecl, parent: parent! });
      }
      this.traverseNode(node, (child) => findAllDecls(child, node));
    };

    if (functionNode.body) {
      findAllDecls(functionNode.body, functionNode);
    }

    // Helper to check if a position is within a node's range
    const _isInRange = (
      position: { line: number; character: number },
      node: AST.ASTNode,
    ): boolean => {
      if (!node.location) return false;
      const loc = node.location;
      if (position.line < loc.startLine || position.line > loc.endLine) {
        return false;
      }
      if (
        position.line === loc.startLine &&
        position.character < loc.startColumn
      ) {
        return false;
      }
      if (position.line === loc.endLine && position.character > loc.endColumn) {
        return false;
      }
      return true;
    };

    // Find the innermost declaration that contains a reference
    // The key insight: we need to find which Block contains both the declaration and the reference
    const getDeclarationForReference = (
      refNode: AST.ASTNode,
    ): AST.VariableDecl | null => {
      if (!refNode.location) return allDecls[0]?.decl || null;

      // Find declarations that occur before this reference
      const candidateDecls = allDecls.filter((d) => {
        if (!d.decl.location) return false;
        // Declaration must be before or at the reference position
        if (d.decl.location.startLine < refNode.location!.startLine)
          return true;
        if (
          d.decl.location.startLine === refNode.location!.startLine &&
          d.decl.location.startColumn <= refNode.location!.startColumn
        ) {
          return true;
        }
        return false;
      });

      if (candidateDecls.length === 0) {
        // No declaration before this reference - this means the reference
        // is before all local variable declarations, so it can't be a reference
        // to any local variable. Return null to exclude it.
        return null;
      }

      // Helper: find if a node is contained within a Block node
      const isNodeInBlock = (
        node: AST.ASTNode,
        block: AST.ASTNode,
      ): boolean => {
        let found = false;
        const search = (n: AST.ASTNode) => {
          if (n === node) {
            found = true;
            return;
          }
          this.traverseNode(n, search);
        };
        search(block);
        return found;
      };

      // Helper: find the smallest local scope that contains a decl
      // Start from function body and traverse to find innermost containing block/loop
      const findSmallestContainingBlock = (
        decl: AST.VariableDecl,
      ): AST.ASTNode => {
        let smallestBlock: AST.ASTNode = functionNode.body!;

        const searchBlocks = (node: AST.ASTNode) => {
          if (this.isLocalRenameScope(node, functionNode.body!)) {
            if (isNodeInBlock(decl, node)) {
              // Check if this local scope is smaller than current smallest
              if (
                !smallestBlock ||
                (node.location &&
                  smallestBlock.location &&
                  node.location.startLine > smallestBlock.location.startLine)
              ) {
                smallestBlock = node;
              }
            }
          }
          this.traverseNode(node, searchBlocks);
        };

        searchBlocks(functionNode.body!);
        return smallestBlock;
      };

      // For each candidate (most recent first), check if the reference is in its scope
      for (let i = candidateDecls.length - 1; i >= 0; i--) {
        const candidate = candidateDecls[i];
        if (!candidate) continue;

        // Find the Block that contains this declaration
        const declBlock = findSmallestContainingBlock(candidate.decl);

        // Check if the reference is in the same block
        if (isNodeInBlock(refNode, declBlock)) {
          return candidate.decl;
        }
      }

      // No local variable declaration found for this reference
      // This means the reference is either:
      // 1. Outside all local variable scopes (might refer to parameter)
      // 2. Invalid/unreachable code
      // Return null to exclude it from local variable references
      return null;
    };

    // Now collect references, but group them by which declaration they belong to
    const referencesByDecl = new Map<AST.VariableDecl, Location[]>();

    const traverse = (node: AST.ASTNode) => {
      // Find VariableDecl and add it as a reference
      if (
        node.kind === "VariableDecl" &&
        typeof (node as AST.VariableDecl).name === "string" &&
        (node as AST.VariableDecl).name === name
      ) {
        const varDecl = node as AST.VariableDecl;
        const range = this.getNodeRange(varDecl, document);
        if (range) {
          const refs = referencesByDecl.get(varDecl) || [];
          refs.push(Location.create(document.uri, range));
          referencesByDecl.set(varDecl, refs);
        }
      }

      // Find all Identifier references
      if (
        node.kind === "Identifier" &&
        (node as AST.IdentifierExpr).name === name
      ) {
        const decl = getDeclarationForReference(node);
        if (decl) {
          const range = this.getNodeRange(node, document);
          if (range) {
            const refs = referencesByDecl.get(decl) || [];
            refs.push(Location.create(document.uri, range));
            referencesByDecl.set(decl, refs);
          }
        }
      }

      // Find PatternIdentifier bindings
      if (
        node.kind === "PatternIdentifier" &&
        (node as AST.PatternIdentifier).name === name
      ) {
        const decl = getDeclarationForReference(node);
        if (decl) {
          const range = this.getNodeRange(node, document);
          if (range) {
            const refs = referencesByDecl.get(decl) || [];
            refs.push(Location.create(document.uri, range));
            referencesByDecl.set(decl, refs);
          }
        }
      }

      // Traverse children
      this.traverseNode(node, traverse);
    };

    if (functionNode.body) {
      traverse(functionNode.body);
    }

    // Return references for the target declaration (the one the user clicked on)
    // Find which declaration matches the target node
    let targetDeclNode: AST.VariableDecl | null = null;
    if (targetDecl.kind === "VariableDecl") {
      targetDeclNode = targetDecl as AST.VariableDecl;
      debugLog(
        `[ASTRename] Target is VariableDecl at line ${targetDeclNode.location?.startLine}`,
      );
    } else {
      // If the target is an Identifier, find the declaration it refers to
      targetDeclNode = getDeclarationForReference(targetDecl);
      debugLog(
        `[ASTRename] Target is ${targetDecl.kind}, resolved to declaration at line ${targetDeclNode?.location?.startLine}`,
      );
    }

    debugLog(
      `[ASTRename] Found ${allDecls.length} declarations with name "${name}"`,
    );
    for (let i = 0; i < allDecls.length; i++) {
      const d = allDecls[i];
      if (d) {
        debugLog(
          `[ASTRename]   Decl ${i}: line ${d.decl.location?.startLine}`,
        );
      }
    }

    debugLog(
      `[ASTRename] referencesByDecl has ${referencesByDecl.size} entries`,
    );
    referencesByDecl.forEach((refs, decl) => {
      debugLog(
        `[ASTRename]   Decl at line ${decl.location?.startLine}: ${refs.length} references`,
      );
      refs.forEach((ref, idx) => {
        debugLog(
          `[ASTRename]     Ref ${idx}: line ${ref.range.start.line + 1}, char ${ref.range.start.character} to ${ref.range.end.character}`,
        );
      });
    });

    if (targetDeclNode) {
      const result = referencesByDecl.get(targetDeclNode) || [];
      debugLog(
        `[ASTRename] Returning ${result.length} references for target declaration`,
      );
      return result;
    }

    debugLog(`[ASTRename] No target declaration found, returning empty`);
    return references;
  }

  /**
   * Find references to a parameter within its function scope
   */
  private findParameterReferences(
    name: string,
    functionNode: AST.FunctionDecl,
    document: TextDocument,
  ): Location[] {
    const references: Location[] = [];

    // Add the parameter declaration itself
    const param = functionNode.params.find((p) => p.name === name);
    debugLog(
      `[ASTRename] findParameterReferences for "${name}", param found: ${!!param}, has location: ${!!param?.location}`,
    );
    if (param && param.location) {
      debugLog(
        `[ASTRename] Calling getNodeRange for Parameter "${param.name}"`,
      );
      const range = this.getNodeRange(param, document);
      debugLog(
        `[ASTRename] getNodeRange returned: ${range ? `line ${range.start.line}, char ${range.start.character}-${range.end.character}` : "null"}`,
      );
      if (range) {
        references.push(Location.create(document.uri, range));
      }
    }

    // Find all uses in function body
    // We traverse the function body and collect all Identifier references
    // BUT exclude references that are actually to shadow variables

    // First pass: find all shadow variable declarations with their locations
    const shadowDeclarations: AST.VariableDecl[] = [];
    const shadowCatchClauses: AST.CatchClause[] = [];

    const findShadowDecls = (node: AST.ASTNode) => {
      if (
        node.kind === "VariableDecl" &&
        typeof (node as AST.VariableDecl).name === "string" &&
        (node as AST.VariableDecl).name === name
      ) {
        shadowDeclarations.push(node as AST.VariableDecl);
      }
      // Also find catch clauses with matching parameter name
      if (node.kind === "Try") {
        const tryNode = node as AST.TryStmt;
        for (const catchClause of tryNode.catchClauses) {
          if (catchClause.variable === name) {
            shadowCatchClauses.push(catchClause);
          }
        }
      }
      this.traverseNode(node, findShadowDecls);
    };

    if (functionNode.body) {
      findShadowDecls(functionNode.body);
    }

    // Helper: check if an identifier reference is shadowed by a local variable or catch parameter
    const isShadowedReference = (refNode: AST.IdentifierExpr): boolean => {
      if (!refNode.location) return false;

      // Check if shadowed by catch clause
      for (const catchClause of shadowCatchClauses) {
        if (!catchClause.location) continue;

        // Check if the reference is within this catch clause's body
        const isInCatchBlock = (
          node: AST.ASTNode,
          block: AST.ASTNode,
        ): boolean => {
          let found = false;
          const search = (n: AST.ASTNode) => {
            if (n === node) {
              found = true;
              return;
            }
            this.traverseNode(n, search);
          };
          search(block);
          return found;
        };

        if (isInCatchBlock(refNode, catchClause.body)) {
          return true; // Shadowed by catch parameter
        }
      }

      // For each shadow declaration, check if this reference is within its scope
      for (const shadowDecl of shadowDeclarations) {
        if (!shadowDecl.location) continue;

        // Shadow declaration must come before or at the reference position
        const isDeclBefore =
          shadowDecl.location.startLine < refNode.location.startLine ||
          (shadowDecl.location.startLine === refNode.location.startLine &&
            shadowDecl.location.startColumn <= refNode.location.startColumn);

        if (!isDeclBefore) continue;

        // Find the block or loop that contains this shadow declaration
        const findContainingBlock = (
          node: AST.ASTNode,
          target: AST.VariableDecl,
        ): AST.ASTNode | null => {
          // Check if this node is a Block or Loop and contains the target
          if (node.kind === "Block" || node.kind === "Loop") {
            // For Block, check direct statements
            if (node.kind === "Block") {
              const block = node as AST.BlockStmt;
              if (block.statements.includes(target)) {
                return block;
              }
              // Recursively search in child blocks
              for (const stmt of block.statements) {
                const found = findContainingBlock(stmt, target);
                if (found) return found;
              }
            }
            // For Loop, check if target is in init/condition/step/body
            if (node.kind === "Loop") {
              const loop = node as AST.LoopStmt;
              // Check if target is the init statement
              if (loop.init === target) {
                return loop;
              }
              // Check if target is in the loop (recursive check)
              let foundInLoop = false;
              const checkInLoop = (n: AST.ASTNode) => {
                if (n === target) {
                  foundInLoop = true;
                  return;
                }
                this.traverseNode(n, checkInLoop);
              };
              if (loop.body) checkInLoop(loop.body);
              if (foundInLoop) {
                const foundInBody = findContainingBlock(loop.body, target);
                return foundInBody || loop;
              }
            }
          }
          // Check in child nodes
          let found: AST.ASTNode | null = null;
          this.traverseNode(node, (child) => {
            if (!found) {
              const result = findContainingBlock(child, target);
              if (result) found = result;
            }
          });
          return found;
        };

        const shadowBlock = findContainingBlock(functionNode.body!, shadowDecl);
        if (!shadowBlock) continue;

        // Check if the reference is in the same block
        const isInBlock = (node: AST.ASTNode, block: AST.ASTNode): boolean => {
          let found = false;
          const search = (n: AST.ASTNode) => {
            if (n === node) {
              found = true;
              return;
            }
            this.traverseNode(n, search);
          };
          search(block);
          return found;
        };

        if (isInBlock(refNode, shadowBlock)) {
          return true; // This reference is shadowed
        }
      }

      return false; // Not shadowed, refers to parameter
    };

    // Second pass: collect identifier references that refer to the parameter
    const traverse = (node: AST.ASTNode) => {
      // Find Identifier references
      if (
        node.kind === "Identifier" &&
        (node as AST.IdentifierExpr).name === name
      ) {
        const identNode = node as AST.IdentifierExpr;
        // Only include if not shadowed
        if (!isShadowedReference(identNode)) {
          const range = this.getNodeRange(node, document);
          if (range) {
            references.push(Location.create(document.uri, range));
          }
        }
      }

      // Traverse children
      this.traverseNode(node, traverse);
    };

    if (functionNode.body) {
      traverse(functionNode.body);
    }

    return references;
  }

  /**
   * Find references to a struct field across all files
   */
  private findStructFieldReferences(
    fieldName: string,
    structName: string,
  ): Location[] {
    const references: Location[] = [];

    // Find the struct symbol
    const structSymbols = this.symbolIndex.findSymbol(structName);
    if (structSymbols.length === 0) return references;

    const structSymbol = structSymbols[0];
    if (!structSymbol) return references;

    // Add the field declaration
    if (structSymbol.fields) {
      const field = structSymbol.fields.find((f) => f.name === fieldName);
      if (field) {
        // Field location is embedded in the struct declaration
        // We need to find it in the source
        references.push(
          Location.create(
            `file://${structSymbol.filePath}`,
            Range.create(
              {
                line: structSymbol.location.startLine - 1,
                character: structSymbol.location.startColumn - 1,
              },
              {
                line: structSymbol.location.endLine - 1,
                character: structSymbol.location.endColumn - 1,
              },
            ),
          ),
        );
      }
    }

    // Find all member accesses: obj.fieldName
    // For simplicity, just search in the file where the struct is defined
    const files = [structSymbol.filePath];
    for (const file of files) {
      // Search for .fieldName pattern
      const _regex = new RegExp(`\\.${fieldName}\\b`, "g");
      try {
        const content = require("fs").readFileSync(file, "utf-8");
        const lines = content.split("\n");

        let match;
        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          if (!line) continue;

          const lineRegex = new RegExp(`\\.${fieldName}\\b`, "g");
          while ((match = lineRegex.exec(line)) !== null) {
            references.push(
              Location.create(
                `file://${file}`,
                Range.create(
                  { line: lineIdx, character: match.index + 1 }, // +1 to skip the dot
                  {
                    line: lineIdx,
                    character: match.index + 1 + fieldName.length,
                  },
                ),
              ),
            );
          }
        }
      } catch (error) {
        console.error(`[ASTRename] Error reading file ${file}:`, error);
      }
    }

    return references;
  }

  /**
   * Find references to a struct method across all files
   */
  private findStructMethodReferences(
    methodName: string,
    structName: string,
  ): Location[] {
    const references: Location[] = [];

    // Find the struct symbol
    const structSymbols = this.symbolIndex.findSymbol(structName);
    if (structSymbols.length === 0) return references;

    const structSymbol = structSymbols[0];
    if (!structSymbol) return references;

    // Add the method declaration
    if (structSymbol.methods) {
      const method = structSymbol.methods.find((m) => m.name === methodName);
      if (method) {
        references.push(
          Location.create(
            `file://${structSymbol.filePath}`,
            Range.create(
              {
                line: method.location.startLine - 1,
                character: method.location.startColumn - 1,
              },
              {
                line: method.location.endLine - 1,
                character: method.location.endColumn - 1,
              },
            ),
          ),
        );
      }
    }

    // Find all method calls: obj.methodName(
    // For simplicity, just search in the file where the struct is defined
    const files = [structSymbol.filePath];
    for (const file of files) {
      const _regex = new RegExp(`\\.${methodName}\\s*\\(`, "g");
      try {
        const content = require("fs").readFileSync(file, "utf-8");
        const lines = content.split("\n");

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          if (!line) continue;

          const lineRegex = new RegExp(`\\.${methodName}\\s*\\(`, "g");
          let match;
          while ((match = lineRegex.exec(line)) !== null) {
            references.push(
              Location.create(
                `file://${file}`,
                Range.create(
                  { line: lineIdx, character: match.index + 1 }, // +1 to skip the dot
                  {
                    line: lineIdx,
                    character: match.index + 1 + methodName.length,
                  },
                ),
              ),
            );
          }
        }
      } catch (error) {
        console.error(`[ASTRename] Error reading file ${file}:`, error);
      }
    }

    return references;
  }

  /**
   * Find references to a global symbol across all files
   */
  private findGlobalSymbolReferences(
    symbolName: string,
    _symbolType: string,
  ): Location[] {
    const references: Location[] = [];

    // Find the symbol declaration
    const symbols = this.symbolIndex.findSymbol(symbolName);
    if (symbols.length > 0 && symbols[0]) {
      const symbol = symbols[0];
      references.push(
        Location.create(
          `file://${symbol.filePath}`,
          Range.create(
            {
              line: symbol.location.startLine - 1,
              character: symbol.location.startColumn - 1,
            },
            {
              line: symbol.location.endLine - 1,
              character: symbol.location.endColumn - 1,
            },
          ),
        ),
      );

      // For global symbols, only search in the file where it's defined
      // A full implementation would search all files that import it
      const files = [symbol.filePath];
      for (const file of files) {
        const _regex = new RegExp(`\\b${symbolName}\\b`, "g");
        try {
          const content = require("fs").readFileSync(file, "utf-8");
          const lines = content.split("\n");

          for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            if (!line) continue;

            const lineRegex = new RegExp(`\\b${symbolName}\\b`, "g");
            let match: RegExpExecArray | null;
            while ((match = lineRegex.exec(line)) !== null) {
              // Skip the declaration we already added
              const isDuplicate = references.some(
                (ref) =>
                  ref.uri === `file://${file}` &&
                  ref.range.start.line === lineIdx &&
                  ref.range.start.character === match!.index,
              );
              if (!isDuplicate) {
                references.push(
                  Location.create(
                    `file://${file}`,
                    Range.create(
                      { line: lineIdx, character: match.index },
                      {
                        line: lineIdx,
                        character: match.index + symbolName.length,
                      },
                    ),
                  ),
                );
              }
            }
          }
        } catch (error) {
          console.error(`[ASTRename] Error reading file ${file}:`, error);
        }
      }
    }

    return references;
  }

  /**
   * Analyze a symbol to determine its type and scope
   */
  private analyzeSymbol(
    node: AST.ASTNode,
    filePath: string,
  ): {
    type: string;
    scope: string;
    node: AST.ASTNode;
    functionNode?: AST.FunctionDecl;
    structName?: string;
  } | null {
    const ast = this.astResolver.getAST(filePath);
    if (!ast) return null;

    // Find the containing function or struct
    const containingFunction = this.findContainingFunction(node, ast);
    const containingStruct = this.findContainingStruct(node, ast);

    // Handle VariableDecl directly - treat as local variable
    if (node.kind === "VariableDecl") {
      const varDecl = node as AST.VariableDecl;
      if (varDecl.isGlobal) {
        return {
          type: "global-variable",
          scope: "global",
          node,
        };
      } else if (containingFunction) {
        return {
          type: "local-variable",
          scope: "function",
          node,
          functionNode: containingFunction,
        };
      }
    }

    // Handle Parameter directly (even if kind is undefined due to parser bug)
    const isParameter =
      node.kind === "Parameter" ||
      (!node.kind &&
        (node as any).name &&
        (node as any).type &&
        ("isConst" in (node as any) || "isVariadic" in (node as any)));

    if (isParameter) {
      if (containingFunction) {
        return {
          type: "parameter",
          scope: "function",
          node,
          functionNode: containingFunction,
        };
      }
    }

    // Handle PatternIdentifier (bindings in match expressions)
    if (node.kind === "PatternIdentifier") {
      if (containingFunction) {
        return {
          type: "pattern-binding",
          scope: "function",
          node,
          functionNode: containingFunction,
        };
      }
    }

    // Handle catch clause parameter
    const containingCatch = this.findContainingCatchClause(node, ast);
    if (containingCatch) {
      // Check if the node is the catch parameter itself (by variable name)
      const catchVarName = containingCatch.variable;
      const symbolName = this.getSymbolName(node);
      if (symbolName === catchVarName) {
        return {
          type: "catch-parameter",
          scope: "catch",
          node,
          functionNode: containingFunction || undefined,
        };
      }
    }

    // Handle FunctionDecl
    if (node.kind === "FunctionDecl") {
      return {
        type: "function",
        scope: containingStruct ? "struct" : "global",
        node,
        structName: containingStruct?.name,
      };
    }

    // Handle StructDecl
    if (node.kind === "StructDecl") {
      return {
        type: "struct",
        scope: "global",
        node,
      };
    }

    // Handle EnumDecl
    if (node.kind === "EnumDecl") {
      return {
        type: "enum",
        scope: "global",
        node,
      };
    }

    if (node.kind === "Identifier") {
      const name = (node as AST.IdentifierExpr).name;

      // Check if it's a local variable FIRST (to handle shadowing)
      // BUT only if the identifier is actually in scope of the local variable
      // Local variables should take precedence over parameters when shadowed
      if (containingFunction) {
        const localVarInScope = this.isLocalVariableInScope(
          name,
          node,
          containingFunction,
        );
        if (localVarInScope) {
          return {
            type: "local-variable",
            scope: "function",
            node,
            functionNode: containingFunction,
          };
        }

        // Check if it's a parameter
        const isParam = containingFunction.params.some((p) => p.name === name);
        if (isParam) {
          return {
            type: "parameter",
            scope: "function",
            node,
            functionNode: containingFunction,
          };
        }
      }

      // Check if it's a global symbol
      const symbols = this.symbolIndex.findSymbol(name);
      if (symbols.length > 0 && symbols[0]) {
        return {
          type: symbols[0].kind,
          scope: "global",
          node,
        };
      }
    }

    // Check if it's a member access (field or method)
    if (node.kind === "Member") {
      const memberNode = node as AST.MemberExpr;
      const memberName = memberNode.property;

      if (containingStruct) {
        // Check if it's a field
        const isField = containingStruct.members.some(
          (m) =>
            m.kind === "StructField" &&
            (m as AST.StructField).name === memberName,
        );
        if (isField) {
          return {
            type: "struct-field",
            scope: "struct",
            node,
            structName: containingStruct.name,
          };
        }

        // Check if it's a method
        const isMethod = containingStruct.members.some(
          (m) =>
            m.kind === "FunctionDecl" &&
            (m as AST.FunctionDecl).name === memberName,
        );
        if (isMethod) {
          return {
            type: "struct-method",
            scope: "struct",
            node,
            structName: containingStruct.name,
          };
        }
      }
    }

    return null;
  }

  /**
   * Check if a name is a local variable in a function
   */
  private isLocalVariable(
    name: string,
    functionNode: AST.FunctionDecl,
  ): boolean {
    let found = false;

    const traverse = (node: AST.ASTNode) => {
      if (node.kind === "VariableDecl") {
        const varDecl = node as AST.VariableDecl;
        if (varDecl.name === name) {
          found = true;
        }
      }
      if (!found) {
        this.traverseNode(node, traverse);
      }
    };

    if (functionNode.body) {
      traverse(functionNode.body);
    }

    return found;
  }

  /**
   * Check if a local variable with the given name is in scope at the position of the given node
   */
  private isLocalVariableInScope(
    name: string,
    refNode: AST.ASTNode,
    functionNode: AST.FunctionDecl,
  ): boolean {
    if (!refNode.location) return false;

    // Find all local variable declarations with this name
    const declarations: { decl: AST.VariableDecl; parent: AST.ASTNode }[] = [];

    const findDecls = (node: AST.ASTNode, parent: AST.ASTNode | null) => {
      if (node.kind === "VariableDecl") {
        const varDecl = node as AST.VariableDecl;
        if (varDecl.name === name && parent) {
          declarations.push({ decl: varDecl, parent });
        }
      }
      this.traverseNode(node, (child) => findDecls(child, node));
    };

    if (functionNode.body) {
      findDecls(functionNode.body, null);
    }

    // Helper: check if a node is contained within a block
    const isNodeInBlock = (node: AST.ASTNode, block: AST.ASTNode): boolean => {
      let found = false;
      const search = (n: AST.ASTNode) => {
        if (n === node) {
          found = true;
          return;
        }
        this.traverseNode(n, search);
      };
      search(block);
      return found;
    };

    // Helper: find the smallest local scope that contains a declaration
    const findSmallestContainingBlock = (
      decl: AST.VariableDecl,
    ): AST.ASTNode => {
      let smallestBlock: AST.ASTNode = functionNode.body!;

      const searchBlocks = (node: AST.ASTNode) => {
        if (this.isLocalRenameScope(node, functionNode.body!)) {
          if (isNodeInBlock(decl, node)) {
            // Check if this local scope is smaller than current smallest
            if (
              !smallestBlock ||
              (node.location &&
                smallestBlock.location &&
                node.location.startLine > smallestBlock.location.startLine)
            ) {
              smallestBlock = node;
            }
          }
        }
        this.traverseNode(node, searchBlocks);
      };

      searchBlocks(functionNode.body!);
      return smallestBlock;
    };

    // Check if any declaration is before this reference AND the reference is in its scope
    for (const { decl } of declarations) {
      if (!decl.location) continue;

      // Declaration must be before or at the reference position
      const isDeclBefore =
        decl.location.startLine < refNode.location.startLine ||
        (decl.location.startLine === refNode.location.startLine &&
          decl.location.startColumn <= refNode.location.startColumn);

      if (isDeclBefore) {
        // Also check if the reference is within the scope (block) of this declaration
        const declBlock = findSmallestContainingBlock(decl);
        if (isNodeInBlock(refNode, declBlock)) {
          return true;
        }
      }
    }

    return false;
  }

  private isLocalRenameScope(
    node: AST.ASTNode,
    functionBody: AST.BlockStmt,
  ): boolean {
    return (
      (node.kind === "Block" && node !== functionBody) ||
      node.kind === "Loop" ||
      node.kind === "Switch" ||
      node.kind === "Case"
    );
  }

  /**
   * Find the containing function of a node
   */
  private findContainingFunction(
    node: AST.ASTNode,
    ast: AST.Program,
  ): AST.FunctionDecl | null {
    if (!node.location) return null;

    // Find a function that contains this node
    const findFunc = (statements: AST.ASTNode[]): AST.FunctionDecl | null => {
      for (const stmt of statements) {
        if (stmt.kind === "FunctionDecl") {
          const func = stmt as AST.FunctionDecl;
          if (func.location && node.location) {
            // Check if node is inside this function
            const nodeInFunc =
              (node.location.startLine > func.location.startLine ||
                (node.location.startLine === func.location.startLine &&
                  node.location.startColumn >= func.location.startColumn)) &&
              (node.location.endLine < func.location.endLine ||
                (node.location.endLine === func.location.endLine &&
                  node.location.endColumn <= func.location.endColumn));

            if (nodeInFunc && node !== func) {
              return func;
            }
          }
        }

        // Check structs for method functions
        if (stmt.kind === "StructDecl") {
          const struct = stmt as AST.StructDecl;
          for (const member of struct.members) {
            if (member.kind === "FunctionDecl") {
              const func = member as AST.FunctionDecl;
              if (func.location && node.location) {
                const nodeInFunc =
                  (node.location.startLine > func.location.startLine ||
                    (node.location.startLine === func.location.startLine &&
                      node.location.startColumn >=
                        func.location.startColumn)) &&
                  (node.location.endLine < func.location.endLine ||
                    (node.location.endLine === func.location.endLine &&
                      node.location.endColumn <= func.location.endColumn));

                if (nodeInFunc && node !== func) {
                  return func;
                }
              }
            }
          }
        }
      }
      return null;
    };

    return findFunc(ast.statements);
  }

  /**
   * Find the containing struct of a node
   */
  private findContainingStruct(
    _node: AST.ASTNode,
    _ast: AST.Program,
  ): AST.StructDecl | null {
    // This is a simplified implementation
    return null;
  }

  /**
   * Find the containing catch clause of a node
   */
  private findContainingCatchClause(
    node: AST.ASTNode,
    ast: AST.Program,
  ): AST.CatchClause | null {
    if (!node.location) return null;

    let foundCatch: AST.CatchClause | null = null;

    const searchForCatch = (n: AST.ASTNode) => {
      if (n.kind === "Try") {
        const tryNode = n as AST.TryStmt;
        for (const catchClause of tryNode.catchClauses) {
          if (catchClause.location && node.location) {
            // Check if node is inside this catch clause
            const nodeInCatch =
              (node.location.startLine > catchClause.location.startLine ||
                (node.location.startLine === catchClause.location.startLine &&
                  node.location.startColumn >=
                    catchClause.location.startColumn)) &&
              (node.location.endLine < catchClause.location.endLine ||
                (node.location.endLine === catchClause.location.endLine &&
                  node.location.endColumn <= catchClause.location.endColumn));

            if (nodeInCatch && node !== catchClause) {
              foundCatch = catchClause;
              return;
            }
          }
        }
      }
      this.traverseNode(n, searchForCatch);
    };

    for (const stmt of ast.statements) {
      searchForCatch(stmt);
      if (foundCatch) break;
    }

    return foundCatch;
  }

  /**
   * Find references to a catch parameter within its catch clause scope
   */
  private findCatchParameterReferences(
    name: string,
    catchClause: AST.CatchClause | null,
    document: TextDocument,
  ): Location[] {
    const references: Location[] = [];
    if (!catchClause) return references;

    // Add the catch parameter declaration itself if it has a location
    if (catchClause.location) {
      // Find the position of the parameter name in the catch clause
      // catch (e: int) - the parameter name 'e' starts after "catch ("
      const catchLine = document.getText().split("\n")[
        catchClause.location.startLine - 1
      ];
      if (catchLine) {
        const catchMatch = catchLine.match(/catch\s*\(\s*(\w+)/);
        if (catchMatch && catchMatch[1] === name) {
          const paramStartCol = catchLine.indexOf(
            catchMatch[1],
            catchMatch.index!,
          );
          const range: Range = {
            start: {
              line: catchClause.location.startLine - 1,
              character: paramStartCol,
            },
            end: {
              line: catchClause.location.startLine - 1,
              character: paramStartCol + name.length,
            },
          };
          references.push(Location.create(document.uri, range));
        }
      }
    }

    // Search within THIS specific catch clause's body
    const traverseCatch = (n: AST.ASTNode) => {
      if (n.kind === "Identifier" && (n as AST.IdentifierExpr).name === name) {
        const range = this.getNodeRange(n, document);
        if (range) {
          references.push(Location.create(document.uri, range));
        }
      }
      this.traverseNode(n, traverseCatch);
    };

    traverseCatch(catchClause.body);

    return references;
  }

  /**
   * Check if a node can be renamed
   */
  private isRenameableNode(node: AST.ASTNode): boolean {
    // Check for Parameter even if kind is undefined (parser bug workaround)
    // A Parameter has name (string), type, and isConst/isVariadic properties
    if (!node.kind && (node as any).name && (node as any).type) {
      const maybeParam = node as any;
      if (
        typeof maybeParam.name === "string" &&
        maybeParam.type &&
        ("isConst" in maybeParam || "isVariadic" in maybeParam)
      ) {
        return true; // It's a Parameter with missing kind
      }
    }

    return (
      node.kind === "Identifier" ||
      node.kind === "FunctionDecl" ||
      node.kind === "StructDecl" ||
      node.kind === "EnumDecl" ||
      node.kind === "VariableDecl" ||
      node.kind === "Parameter" ||
      node.kind === "PatternIdentifier"
    );
  }

  /**
   * Find the AST node at a specific position
   */
  private findNodeAtPosition(
    filePath: string,
    line: number,
    character: number,
  ): AST.ASTNode | null {
    const ast = this.astResolver.getAST(filePath);
    if (!ast) return null;

    let targetNode: AST.ASTNode | null = null;

    const traverse = (node: AST.ASTNode, depth: number = 0) => {
      if (!node.location) return;

      const loc = node.location;
      const inRange =
        (line > loc.startLine ||
          (line === loc.startLine && character >= loc.startColumn - 1)) &&
        (line < loc.endLine ||
          (line === loc.endLine && character <= loc.endColumn - 1));

      if (inRange) {
        const currentSize =
          (loc.endLine - loc.startLine) * 1000 +
          (loc.endColumn - loc.startColumn);

        // Select the smallest (most specific) node
        // Compare by range size: smaller range = more specific
        if (!targetNode || !targetNode.location) {
          targetNode = node;
        } else {
          const targetSize =
            (targetNode.location.endLine - targetNode.location.startLine) *
              1000 +
            (targetNode.location.endColumn - targetNode.location.startColumn);

          // If current node is smaller, it's more specific
          if (currentSize < targetSize) {
            targetNode = node;
          }
        }

        // Special handling for FunctionDecl parameters
        if (node.kind === "FunctionDecl") {
          const funcDecl = node as AST.FunctionDecl;
          debugLog(
            `[ASTRename] Checking FunctionDecl params, count: ${funcDecl.params.length}`,
          );
          for (const param of funcDecl.params) {
            debugLog(
              `[ASTRename] Param: name="${param.name}", kind="${param.kind}", has location: ${!!param.location}`,
            );
            if (param.location) {
              const paramLoc = param.location;
              const inParamRange =
                (line > paramLoc.startLine ||
                  (line === paramLoc.startLine &&
                    character >= paramLoc.startColumn - 1)) &&
                (line < paramLoc.endLine ||
                  (line === paramLoc.endLine &&
                    character <= paramLoc.endColumn - 1));

              debugLog(
                `[ASTRename] Param "${param.name}" range check: line ${line} char ${character} in (${paramLoc.startLine}:${paramLoc.startColumn}-${paramLoc.endLine}:${paramLoc.endColumn})? ${inParamRange}`,
              );

              if (inParamRange) {
                const paramSize =
                  (paramLoc.endLine - paramLoc.startLine) * 1000 +
                  (paramLoc.endColumn - paramLoc.startColumn);

                if (
                  !targetNode ||
                  !targetNode.location ||
                  paramSize < currentSize
                ) {
                  debugLog(
                    `[ASTRename] Setting targetNode to Parameter "${param.name}"`,
                  );
                  targetNode = param;
                }
              }
            }
          }
        }

        // Always continue searching children for more specific nodes
        this.traverseNode(node, (child) => traverse(child, depth + 1));
      }
    };

    for (const stmt of ast.statements) {
      traverse(stmt, 0);
    }

    return targetNode;
  }

  /**
   * Get the range of a node in the document
   */
  private getNodeRange(
    node: AST.ASTNode,
    document: TextDocument,
  ): Range | null {
    debugLog(`[ASTRename] getNodeRange called for node kind: ${node.kind}`);
    if (!node.location) return null;

    // For VariableDecl, return just the identifier range, not the whole declaration
    if (node.kind === "VariableDecl") {
      const varDecl = node as AST.VariableDecl;
      if (typeof varDecl.name === "string") {
        // Find "local " or "global " prefix and skip it
        const line = document.getText({
          start: {
            line: node.location.startLine - 1,
            character: 0,
          },
          end: {
            line: node.location.startLine - 1,
            character: 1000,
          },
        });

        const match = line.match(/\b(local|global)\s+(\w+)/);
        if (match && match[1] && match[2] === varDecl.name) {
          const startChar = match.index! + match[1].length + 1; // Skip "local " or "global "
          return Range.create(
            {
              line: node.location.startLine - 1,
              character: startChar,
            },
            {
              line: node.location.startLine - 1,
              character: startChar + varDecl.name.length,
            },
          );
        }
      }
    }

    // Check if this is a Parameter (even if kind is undefined due to parser bug)
    const isParameter =
      node.kind === "Parameter" ||
      (!node.kind &&
        (node as any).name &&
        (node as any).type &&
        ("isConst" in (node as any) || "isVariadic" in (node as any)));

    if (isParameter) {
      debugLog(`[ASTRename] Detected Parameter node`);
      const param = node as AST.Parameter;
      debugLog(`[ASTRename] Parameter name: "${param.name}"`);
      // For parameters, the location covers "name: type", but we only want "name"
      // We need to find where the name actually starts in the text
      if (node.location) {
        debugLog(
          `[ASTRename] Parameter location: line ${node.location.startLine}, col ${node.location.startColumn} to line ${node.location.endLine}, col ${node.location.endColumn}`,
        );
        // Get the full parameter text
        const fullParamText = document.getText({
          start: {
            line: node.location.startLine - 1,
            character: node.location.startColumn - 1,
          },
          end: {
            line: node.location.endLine - 1,
            character: node.location.endColumn - 1,
          },
        });
        debugLog(`[ASTRename] Full parameter text: "${fullParamText}"`);

        // Find where the parameter name appears in the text
        // It could be preceded by "const", "...", or whitespace
        const nameMatch = fullParamText.match(
          new RegExp(`\\b${param.name}\\b`),
        );
        debugLog(
          `[ASTRename] Regex match result: ${nameMatch ? `found at index ${nameMatch.index}` : "not found"}`,
        );
        if (nameMatch && nameMatch.index !== undefined) {
          const nameStartOffset = nameMatch.index;
          const start = {
            line: node.location.startLine - 1,
            character: node.location.startColumn - 1 + nameStartOffset,
          };
          const end = {
            line: node.location.startLine - 1,
            character:
              node.location.startColumn -
              1 +
              nameStartOffset +
              param.name.length,
          };
          debugLog(
            `[ASTRename] Parameter "${param.name}" at offset ${nameStartOffset}, range: line ${start.line}, char ${start.character}-${end.character}`,
          );
          debugLog(
            `[ASTRename] Text at range: "${document.getText(Range.create(start, end))}"`,
          );
          return Range.create(start, end);
        }
        debugLog(
          `[ASTRename] WARNING: Failed to find parameter name in text, falling through to default`,
        );
      } else {
        debugLog(`[ASTRename] WARNING: Parameter has no location`);
      }
    }

    if (node.kind === "PatternIdentifier") {
      const patternId = node as AST.PatternIdentifier;
      return Range.create(
        {
          line: node.location.startLine - 1,
          character: node.location.startColumn - 1,
        },
        {
          line: node.location.startLine - 1,
          character: node.location.startColumn - 1 + patternId.name.length,
        },
      );
    }

    return Range.create(
      {
        line: node.location.startLine - 1,
        character: node.location.startColumn - 1,
      },
      {
        line: node.location.endLine - 1,
        character: node.location.endColumn - 1,
      },
    );
  }

  /**
   * Get the name of a symbol from a node
   */
  private getSymbolName(node: AST.ASTNode): string | null {
    // Handle Parameter even if kind is undefined
    if (
      !node.kind &&
      (node as any).name &&
      (node as any).type &&
      ("isConst" in (node as any) || "isVariadic" in (node as any))
    ) {
      return (node as any).name;
    }

    switch (node.kind) {
      case "Identifier":
        return (node as AST.IdentifierExpr).name;
      case "FunctionDecl":
        return (node as AST.FunctionDecl).name;
      case "StructDecl":
        return (node as AST.StructDecl).name;
      case "EnumDecl":
        return (node as AST.EnumDecl).name;
      case "VariableDecl": {
        const varDecl = node as AST.VariableDecl;
        return typeof varDecl.name === "string" ? varDecl.name : null;
      }
      case "Parameter":
        return (node as AST.Parameter).name;
      case "PatternIdentifier":
        return (node as AST.PatternIdentifier).name;
      default:
        return null;
    }
  }

  /**
   * Traverse an AST node and its children
   */
  private traverseNode(
    node: AST.ASTNode,
    callback: (node: AST.ASTNode) => void,
  ) {
    // Traverse based on node type
    switch (node.kind) {
      case "FunctionDecl":
        const funcNode = node as AST.FunctionDecl;
        // Traverse parameters
        funcNode.params.forEach(callback);
        // Traverse body
        if (funcNode.body) callback(funcNode.body);
        break;
      case "Block":
        (node as AST.BlockStmt).statements.forEach(callback);
        break;
      case "ExpressionStmt":
        const exprStmt = node as AST.ExpressionStmt;
        callback(exprStmt.expression);
        break;
      case "If":
        const ifNode = node as AST.IfStmt;
        callback(ifNode.condition);
        callback(ifNode.thenBranch);
        if (ifNode.elseBranch) callback(ifNode.elseBranch);
        break;
      case "Loop":
        const loopNode = node as AST.LoopStmt;
        if (loopNode.init) callback(loopNode.init);
        if (loopNode.condition) callback(loopNode.condition);
        if (loopNode.step) callback(loopNode.step);
        callback(loopNode.body);
        break;
      case "Try":
        const tryNode = node as AST.TryStmt;
        callback(tryNode.tryBlock);
        tryNode.catchClauses.forEach(callback);
        break;
      case "CatchClause":
        const catchNode = node as AST.CatchClause;
        callback(catchNode.body);
        break;
      case "Defer":
        const deferNode = node as AST.DeferStmt;
        callback(deferNode.statement);
        break;
      case "Switch":
        const switchNode = node as AST.SwitchStmt;
        callback(switchNode.expression);
        switchNode.cases.forEach((c) => {
          callback(c.value);
          callback(c.body);
        });
        if (switchNode.defaultCase) callback(switchNode.defaultCase);
        break;
      case "Return":
        const retNode = node as AST.ReturnStmt;
        if (retNode.value) callback(retNode.value);
        break;
      case "VariableDecl":
        const varNode = node as AST.VariableDecl;
        // Note: varNode.name is a string, not a node, so don't traverse it
        // Only traverse the initializer which may contain Identifier expressions
        if (varNode.initializer) callback(varNode.initializer);
        break;
      case "Assignment":
        const assignNode = node as AST.AssignmentExpr;
        callback(assignNode.assignee);
        callback(assignNode.value);
        break;
      case "Binary":
        const binNode = node as AST.BinaryExpr;
        callback(binNode.left);
        callback(binNode.right);
        break;
      case "Unary":
        const unaryNode = node as AST.UnaryExpr;
        callback(unaryNode.operand);
        break;
      case "Cast":
        const castNode = node as AST.CastExpr;
        callback(castNode.expression);
        break;
      case "Grouped":
        const groupedNode = node as AST.GroupExpr;
        callback(groupedNode.expression);
        break;
      case "Index":
        const indexNode = node as AST.IndexExpr;
        callback(indexNode.object);
        callback(indexNode.index);
        break;
      case "Call":
        const callNode = node as AST.CallExpr;
        callback(callNode.callee);
        callNode.args.forEach(callback);
        break;
      case "Member":
        const memberNode = node as AST.MemberExpr;
        callback(memberNode.object);
        break;
      case "Match":
        const matchNode = node as AST.MatchExpr;
        callback(matchNode.value);
        matchNode.arms.forEach((arm: AST.MatchArm) => {
          // Traverse the pattern to find PatternIdentifier bindings
          callback(arm.pattern);
          callback(arm.body);
        });
        break;
      case "MatchArm":
        const armNode = node as AST.MatchArm;
        callback(armNode.pattern);
        callback(armNode.body);
        break;
      case "PatternEnum":
      case "PatternLiteral":
      case "PatternWildcard":
        // These patterns don't have bindings
        break;
      case "PatternEnumTuple":
        // PatternEnumTuple now has Pattern[] bindings (PatternIdentifier or PatternWildcard)
        const enumTuple = node as AST.PatternEnumTuple;
        enumTuple.bindings.forEach(callback);
        break;
      case "PatternEnumStruct":
        // PatternEnumStruct has fields with bindings
        const enumStruct = node as AST.PatternEnumStruct;
        enumStruct.fields.forEach((_field) => {
          // Field bindings are strings (variable names), not Pattern nodes
          // We don't need to traverse them since they're just names
        });
        break;
      case "PatternIdentifier":
        // This is a leaf node (the binding itself)
        break;
      // Add more cases as needed
    }
  }
}

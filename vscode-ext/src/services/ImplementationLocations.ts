import { Location, Range } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import type { TypeNode } from "../../../compiler/common/AST";
import type { ASTResolver } from "./ASTResolver";

/** Find direct implementations in open source, excluding comments/string data. */
export function implementationLocations(
  name: string,
  documents: readonly TextDocument[],
  resolver: ASTResolver,
): Location[] {
  const locations: Location[] = [];
  for (const document of documents) {
    try {
      const program = resolver.parseDocumentContent(
        fileURLToPath(document.uri),
        document.getText(),
      );
      if (!program || program.errors?.length) continue;
      for (const declaration of program.statements) {
        let parents: readonly TypeNode[];
        if (declaration.kind === "StructDecl")
          parents = declaration.inheritanceList;
        else if (declaration.kind === "SpecDecl") parents = declaration.extends;
        else if (declaration.kind === "EnumDecl")
          parents = declaration.implements;
        else continue;
        if (
          !parents.some(
            (parent) => parent.kind === "BasicType" && parent.name === name,
          )
        )
          continue;
        const location = declaration.location;
        locations.push(
          Location.create(
            document.uri,
            Range.create(
              location.startLine - 1,
              location.startColumn - 1,
              location.endLine - 1,
              location.endColumn - 1,
            ),
          ),
        );
      }
    } catch {
      // Incomplete/non-file documents cannot hide valid implementations elsewhere.
    }
  }
  return locations;
}

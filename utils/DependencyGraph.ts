import { dirname, relative, resolve } from "path";

import { extractImportStatements, parseFile } from "./parser";

import type ProgramExpr from "../parser/expression/programExpr";
import { Logger } from "./Logger";

export function generateDependencyGraph(entryFile: string): string {
  const edges: { from: string; to: string }[] = [];
  const visited = new Set<string>();
  const queue = [resolve(entryFile)];
  // Use the directory of the entry file as the base for relative paths
  const rootDir = dirname(resolve(entryFile));

  while (queue.length > 0) {
    const currentFile = queue.shift()!;
    if (visited.has(currentFile)) continue;
    visited.add(currentFile);

    try {
      const program = parseFile(currentFile) as ProgramExpr;
      const imports = extractImportStatements(program);

      for (const importExpr of imports) {
        let moduleName = importExpr.moduleName;
        let absolutePath = "";
        let isVirtual = false;

        if (moduleName === "std") {
          absolutePath = resolve(__dirname, "../lib/std.x");
        } else if (moduleName === "libc" || moduleName === "c") {
          absolutePath = "libc";
          isVirtual = true;
        } else if (moduleName.startsWith(".") || moduleName.startsWith("/")) {
          const libDir = dirname(currentFile);
          absolutePath = resolve(libDir, moduleName);
        } else {
          absolutePath = moduleName;
          isVirtual = true;
        }

        const fromNode = relative(rootDir, currentFile) || currentFile;
        let toNode = "";

        if (isVirtual) {
          toNode = absolutePath;
        } else {
          toNode = relative(rootDir, absolutePath) || absolutePath;
        }

        // Avoid self-loops if any
        if (fromNode !== toNode) {
          edges.push({ from: fromNode, to: toNode });
        }

        if (
          !isVirtual &&
          absolutePath.endsWith(".x") &&
          !visited.has(absolutePath)
        ) {
          queue.push(absolutePath);
        }
      }
    } catch (e) {
      Logger.warn(`Failed to parse ${currentFile} for dependency graph:`, e);
    }
  }

  let dot = "digraph Dependencies {\n";
  dot += "  rankdir=LR;\n";
  dot +=
    '  node [shape=box, style=filled, fillcolor="#f9f9f9", fontname="Helvetica"];\n';
  dot += '  edge [color="#555555"];\n';

  // Deduplicate edges
  const uniqueEdges = new Set<string>();

  for (const edge of edges) {
    const edgeStr = `  "${edge.from}" -> "${edge.to}";`;
    if (!uniqueEdges.has(edgeStr)) {
      uniqueEdges.add(edgeStr);
      dot += edgeStr + "\n";
    }
  }

  dot += "}\n";

  return dot;
}

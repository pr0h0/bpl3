const OMITTED_AST_ARTIFACT_KEYS = new Set(["resolvedDeclaration", "resolvedType"]);

export interface PlaygroundAstArtifactStringifyOptions {
  sourceFile?: string;
}

export function stringifyPlaygroundAstArtifact(
  value: unknown,
  options: PlaygroundAstArtifactStringifyOptions = {},
): string {
  const seen = new WeakSet<object>();
  const artifact = focusProgramOnSourceFile(value, options.sourceFile);
  return JSON.stringify(
    artifact,
    (key, current) => {
      if (OMITTED_AST_ARTIFACT_KEYS.has(key)) {
        return undefined;
      }

      if (typeof current === "bigint") {
        return current.toString();
      }

      if (typeof current === "object" && current !== null) {
        if (seen.has(current)) {
          return "[Circular]";
        }
        seen.add(current);
      }

      return current;
    },
    2,
  );
}

function focusProgramOnSourceFile(value: unknown, sourceFile: string | undefined) {
  if (sourceFile === undefined || !isRecord(value)) {
    return value;
  }

  if (value.kind !== "Program" || !Array.isArray(value.statements)) {
    return value;
  }

  return {
    ...value,
    statements: value.statements.filter((statement) =>
      isPrimarySourceStatement(statement, sourceFile),
    ),
  };
}

function isPrimarySourceStatement(statement: unknown, sourceFile: string): boolean {
  if (!isRecord(statement)) return true;
  const location = statement.location;
  if (!isRecord(location) || typeof location.file !== "string") return true;
  return location.file === sourceFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

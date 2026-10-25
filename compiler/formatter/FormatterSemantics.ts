/** AST meaning for formatter round trips, excluding source/trivia metadata. */
export function formatterSemantics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(formatterSemantics);
  if (value && typeof value === "object") {
    if ((value as { kind?: string }).kind === "Group")
      return formatterSemantics((value as { expression: unknown }).expression);
    const node = value as Record<string, unknown>;
    // AsmGenerator trims each instruction line before lowering. Its raw body
    // indentation and line-ending bytes are layout, not instruction contents.
    const normalized =
      node.kind === "Asm" && typeof node.content === "string"
        ? {
            ...node,
            content: node.content
              .split(/\r\n?|\n/)
              .map((line) => line.trim())
              .join("\n")
              .trim(),
          }
        : node;
    return Object.fromEntries(
      Object.entries(normalized)
        .filter(
          ([key]) =>
            ![
              "location",
              "comments",
              "documentation",
              "raw",
              "line",
              "column",
              "file",
            ].includes(key),
        )
        .map(([key, child]) => [key, formatterSemantics(child)]),
    );
  }
  return value;
}

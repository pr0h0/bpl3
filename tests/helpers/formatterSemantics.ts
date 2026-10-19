/** AST meaning for formatter round trips, excluding source/trivia metadata. */
export function formatterSemantics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(formatterSemantics);
  if (value && typeof value === "object") {
    if ((value as { kind?: string }).kind === "Group")
      return formatterSemantics((value as { expression: unknown }).expression);
    return Object.fromEntries(
      Object.entries(value)
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

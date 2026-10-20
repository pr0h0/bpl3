/** Formatting preferences. Omitted values use the BPL language style. */
export interface FormatterOptions {
  indentWidth?: number;
  useTabs?: boolean;
  lineEnding?: "lf" | "crlf";
}

export type ResolvedFormatterOptions = Required<FormatterOptions>;

export const DEFAULT_FORMATTER_OPTIONS: Readonly<ResolvedFormatterOptions> =
  Object.freeze({
    indentWidth: 4,
    useTabs: false,
    lineEnding: "lf",
  });

/** Validate JSON/API options without executing configuration or ignoring typos. */
export function validateFormatterOptions(value: unknown): FormatterOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Formatter configuration must be a JSON object.");
  }
  const options: FormatterOptions = {};
  for (const [key, entry] of Object.entries(value)) {
    switch (key) {
      case "$schema":
        if (typeof entry !== "string")
          throw new TypeError("Formatter $schema must be a string.");
        break;
      case "indentWidth":
        if (
          typeof entry !== "number" ||
          !Number.isInteger(entry) ||
          entry < 1 ||
          entry > 16
        )
          throw new TypeError(
            "Formatter indentWidth must be an integer from 1 to 16.",
          );
        options.indentWidth = entry;
        break;
      case "useTabs":
        if (typeof entry !== "boolean")
          throw new TypeError("Formatter useTabs must be a boolean.");
        options.useTabs = entry;
        break;
      case "lineEnding":
        if (entry !== "lf" && entry !== "crlf")
          throw new TypeError("Formatter lineEnding must be 'lf' or 'crlf'.");
        options.lineEnding = entry;
        break;
      default:
        throw new TypeError(`Unknown formatter option '${key}'.`);
    }
  }
  return options;
}

/** Resolve validated preferences to a fresh complete option set. */
export function resolveFormatterOptions(
  value: unknown = {},
): ResolvedFormatterOptions {
  return { ...DEFAULT_FORMATTER_OPTIONS, ...validateFormatterOptions(value) };
}

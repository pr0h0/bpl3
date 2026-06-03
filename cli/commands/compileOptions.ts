import type { Command } from "commander";
import type { CompileOptions } from "../types";

export function getExplicitParentCompileOptions(
  command: Command,
): Partial<CompileOptions> {
  const parent = command.parent;
  if (!parent) {
    return {};
  }

  const options = { ...parent.opts<CompileOptions>() };
  if (
    typeof parent.getOptionValueSource === "function" &&
    parent.getOptionValueSource("emit") === "default"
  ) {
    delete options.emit;
  }

  return options;
}

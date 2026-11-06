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

const REPEATABLE_OPTIONS = ["lib", "libPath", "object", "clangFlag"] as const;

/**
 * Repeatable options given both before and after the subcommand
 * (`bpl -l a run -l b main.bpl`) are concatenated rather than replaced.
 */
export function mergeRepeatableOptions(
  parent: CompileOptions,
  local: CompileOptions,
): Partial<CompileOptions> {
  const merged: Partial<CompileOptions> = {};
  for (const key of REPEATABLE_OPTIONS) {
    const values = [parent[key], local[key]]
      .filter((value) => value !== undefined)
      .flatMap((value) => value!);
    if (values.length > 0) merged[key] = values;
  }
  return merged;
}

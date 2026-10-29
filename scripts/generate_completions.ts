/**
 * Generate the bash and zsh completion scripts from the commander tree, so
 * every command and option the CLI accepts is completed and nothing else is.
 *
 *   bun scripts/generate_completions.ts          # write completions/ and the
 *                                                # embedded copy for the binary
 *   bun scripts/generate_completions.ts --check  # fail if any file is stale
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { Command, type Option } from "commander";
import { configureRootOptions } from "../cli/RootProgram";
import { registerRequestedCliSubcommands } from "../cli/CommandRegistration";
import { COMMON_TARGET_TRIPLES } from "../cli/completions";

const root = resolve(import.meta.dir, "..");

/** How the value of an option, or a positional argument, is completed. */
type Completer =
  | { kind: "none" }
  | { kind: "words"; words: readonly string[] }
  | { kind: "files"; pattern?: string }
  | { kind: "directories" }
  | { kind: "sources" }
  | { kind: "commands" };

const VALUE_COMPLETERS: Record<string, Completer> = {
  "--output": { kind: "files" },
  "--debug-ir-path": { kind: "files" },
  "--config": { kind: "files" },
  "--stdin-filepath": { kind: "files" },
  "--header": { kind: "files" },
  "--emit": { kind: "words", words: ["llvm", "ast", "tokens", "formatted"] },
  "--target": { kind: "words", words: COMMON_TARGET_TRIPLES },
  "--wasm-runtime": { kind: "words", words: ["freestanding", "host"] },
  "--line-ending": { kind: "words", words: ["lf", "crlf"] },
  "--template": { kind: "words", words: ["app", "library"] },
  "--sysroot": { kind: "directories" },
  "--lib-path": { kind: "directories" },
  "--object": { kind: "files", pattern: "*.{o,ll,bc}" },
};

/** Positional arguments, by command path (`package-cache list`). */
const POSITIONALS: Record<string, Completer> = {
  "": { kind: "sources" },
  format: { kind: "sources" },
  lint: { kind: "sources" },
  check: { kind: "sources" },
  run: { kind: "files" },
  build: { kind: "files" },
  dev: { kind: "files" },
  docs: { kind: "files" },
  bindgen: { kind: "files" },
  install: { kind: "files" },
  completion: { kind: "words", words: ["bash", "zsh"] },
  doctor: { kind: "words", words: ["packages", "sanitizer"] },
  help: { kind: "commands" },
};

interface OptionInfo {
  flags: string[];
  takesValue: boolean;
  description: string;
  completer: Completer;
}

interface CommandInfo {
  path: string;
  names: string[];
  description: string;
  options: OptionInfo[];
  subcommands: CommandInfo[];
  positional: Completer;
}

function describeOption(option: Option): OptionInfo {
  const flags = [option.short, option.long].filter(
    (flag): flag is string => !!flag,
  );
  const takesValue = option.required || option.optional;
  return {
    flags,
    takesValue,
    description: option.description,
    completer: takesValue
      ? (VALUE_COMPLETERS[option.long ?? ""] ?? { kind: "none" })
      : { kind: "none" },
  };
}

const HELP_OPTION: OptionInfo = {
  flags: ["-h", "--help"],
  takesValue: false,
  description: "display help for command",
  completer: { kind: "none" },
};

function describeCommand(command: Command, path: string): CommandInfo {
  const options = command.options
    .filter((option) => !(option as Option & { hidden?: boolean }).hidden)
    .map(describeOption);
  options.push(HELP_OPTION);
  const subcommands = command.commands.map((sub) =>
    describeCommand(sub, path ? `${path} ${sub.name()}` : sub.name()),
  );
  return {
    path,
    names: [command.name(), ...command.aliases()],
    description: command.description(),
    options,
    subcommands,
    // Names, package specs and the like have nothing useful to complete.
    positional: POSITIONALS[path] ?? { kind: "none" },
  };
}

async function buildTree(): Promise<CommandInfo> {
  const version = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  ).version;
  const program = configureRootOptions(new Command().name("bpl"));
  program.version(version);
  await registerRequestedCliSubcommands(program, ["--help"], version);
  const tree = describeCommand(program, "");
  tree.subcommands.push({
    path: "help",
    names: ["help"],
    description: "display help for command",
    options: [],
    subcommands: [],
    positional: POSITIONALS.help!,
  });
  return tree;
}

const allFlags = (info: CommandInfo) =>
  info.options.flatMap((option) => option.flags);

// ---------------------------------------------------------------- bash ----

function bashCompleter(completer: Completer, indent: string): string {
  switch (completer.kind) {
    case "none":
      return `${indent}return 0`;
    case "words":
      return `${indent}COMPREPLY=( $(compgen -W "${completer.words.join(" ")}" -- "\${cur}") )\n${indent}return 0`;
    case "commands":
      return `${indent}COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )\n${indent}return 0`;
    case "directories":
      return `${indent}COMPREPLY=( $(compgen -d -- "\${cur}") )\n${indent}return 0`;
    case "files":
      if (completer.pattern) {
        const extensions = completer.pattern
          .replace(/^\*\.\{|\}$/g, "")
          .split(",")
          .join("|");
        return `${indent}COMPREPLY=( $(compgen -f -X '!*.@(${extensions})' -- "\${cur}") )\n${indent}return 0`;
      }
      return `${indent}while IFS= read -r match; do COMPREPLY+=("$match"); done < <(compgen -f -- "\${cur}")\n${indent}return 0`;
    case "sources":
      // Directories and both source extensions, keeping names with spaces.
      return [
        `${indent}while IFS= read -r match; do`,
        `${indent}    if [[ -d "$match" || "$match" == *.bpl || "$match" == *.x ]]; then`,
        `${indent}        COMPREPLY+=("$match")`,
        `${indent}    fi`,
        `${indent}done < <(compgen -f -- "\${cur}")`,
        `${indent}return 0`,
      ].join("\n");
  }
}

function collectValueOptions(info: CommandInfo, into: Map<string, Completer>) {
  for (const option of info.options) {
    if (!option.takesValue) continue;
    for (const flag of option.flags) {
      if (!into.has(flag)) into.set(flag, option.completer);
    }
  }
  for (const sub of info.subcommands) collectValueOptions(sub, into);
}

function generateBash(tree: CommandInfo): string {
  const commandNames = tree.subcommands.flatMap((sub) => sub.names);
  const valueOptions = new Map<string, Completer>();
  collectValueOptions(tree, valueOptions);

  // Group value options by completer so each case arm lists its flags.
  const arms = new Map<string, { flags: string[]; completer: Completer }>();
  for (const [flag, completer] of valueOptions) {
    const key = JSON.stringify(completer);
    const arm = arms.get(key) ?? { flags: [], completer };
    arm.flags.push(flag);
    arms.set(key, arm);
  }

  const commandArms: string[] = [];
  for (const sub of tree.subcommands) {
    const pattern = sub.names.join("|");
    const lines = [`        ${pattern})`];
    if (sub.subcommands.length > 0) {
      const subNames = sub.subcommands.flatMap((s) => s.names);
      lines.push(`            if [[ -z "$sub" ]]; then`);
      lines.push(`                if [[ "$cur" == -* ]]; then`);
      lines.push(
        `                    COMPREPLY=( $(compgen -W "${allFlags(sub).join(" ")}" -- "\${cur}") )`,
      );
      lines.push(`                else`);
      lines.push(
        `                    COMPREPLY=( $(compgen -W "${subNames.join(" ")}" -- "\${cur}") )`,
      );
      lines.push(`                fi`);
      lines.push(`                return 0`);
      lines.push(`            fi`);
      lines.push(`            case "$sub" in`);
      for (const nested of sub.subcommands) {
        lines.push(`                ${nested.names.join("|")})`);
        lines.push(
          `                    COMPREPLY=( $(compgen -W "${allFlags(nested).join(" ")}" -- "\${cur}") )`,
        );
        lines.push(`                    return 0`);
        lines.push(`                    ;;`);
      }
      lines.push(`            esac`);
      lines.push(`            return 0`);
    } else {
      lines.push(`            if [[ "$cur" == -* ]]; then`);
      lines.push(
        `                COMPREPLY=( $(compgen -W "${allFlags(sub).join(" ")}" -- "\${cur}") )`,
      );
      lines.push(`                return 0`);
      lines.push(`            fi`);
      lines.push(bashCompleter(sub.positional, "            "));
    }
    lines.push(`            ;;`);
    commandArms.push(lines.join("\n"));
  }

  const subcommandLookup = tree.subcommands
    .filter((sub) => sub.subcommands.length > 0)
    .map(
      (sub) =>
        `            ${sub.names.join("|")}) [[ " ${sub.subcommands.flatMap((s) => s.names).join(" ")} " == *" $word "* ]] && sub="$word" ;;`,
    );

  return `#!/usr/bin/env bash
# Bash completion script for bpl CLI.
# Generated by scripts/generate_completions.ts from the CLI's command
# definitions; do not edit by hand.
# Installation:
#   1. Copy this file to /etc/bash_completion.d/bpl or ~/.local/share/bash-completion/completions/bpl
#   2. Or source it in your ~/.bashrc: source /path/to/bpl-completion.bash
#   3. Or run: bpl completion bash > ~/.local/share/bash-completion/completions/bpl

_bpl_completion() {
    local cur prev word match i command="" sub=""
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    local commands="${commandNames.join(" ")}"

    # Values of options that take one
    case "\${prev}" in
${[...arms.values()]
  .map(
    (arm) =>
      `        ${arm.flags.join("|")})\n${bashCompleter(arm.completer, "            ")}\n            ;;`,
  )
  .join("\n")}
    esac

    # The command (and package-cache style subcommand) typed so far
    for ((i=1; i<COMP_CWORD; i++)); do
        word="\${COMP_WORDS[i]}"
        if [[ -z "$command" ]]; then
            if [[ " $commands " == *" $word "* ]]; then
                command="$word"
            fi
        elif [[ -z "$sub" ]]; then
            case "$command" in
${subcommandLookup.join("\n")}
            esac
        fi
    done

    case "$command" in
${commandArms.join("\n")}
    esac

    # No command yet: root options, commands, or source files
    if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "${allFlags(tree).join(" ")}" -- "\${cur}") )
    else
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        while IFS= read -r match; do
            if [[ -d "$match" || "$match" == *.bpl || "$match" == *.x ]]; then
                COMPREPLY+=("$match")
            fi
        done < <(compgen -f -- "\${cur}")
    fi
    return 0
}

# Register the completion function
complete -o filenames -F _bpl_completion bpl
`;
}

// ----------------------------------------------------------------- zsh ----

/** Text inside a single-quoted `[explanation]` of an _arguments spec. */
const zshExplanation = (text: string) =>
  text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\''")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

/** Text of a `name:description` entry for _describe, where `:` separates. */
const zshDescription = (text: string) =>
  zshExplanation(text).replace(/:/g, "\\:");

function zshValue(completer: Completer, name: string): string {
  switch (completer.kind) {
    case "none":
      return `:${name}`;
    case "words":
      return `:${name}:(${completer.words.join(" ")})`;
    case "commands":
      return `:${name}:->command`;
    case "directories":
      return `:${name}:_directories`;
    case "files":
      return completer.pattern
        ? `:${name}:_files -g "${completer.pattern}"`
        : `:${name}:_files`;
    case "sources":
      return `:${name}:_files -g "*.{bpl,x}"`;
  }
}

function zshOptionSpecs(info: CommandInfo, indent: string): string[] {
  return info.options.map((option) => {
    const description = zshExplanation(option.description);
    const value = option.takesValue ? zshValue(option.completer, "value") : "";
    if (option.flags.length > 1) {
      const exclusive = `(${option.flags.join(" ")})`;
      return `${indent}'${exclusive}'{${option.flags.join(",")}}'[${description}]${value}'`;
    }
    return `${indent}'${option.flags[0]}[${description}]${value}'`;
  });
}

function zshPositional(
  completer: Completer,
  commandNames: readonly string[],
): string | undefined {
  switch (completer.kind) {
    case "none":
      return undefined;
    case "commands":
      return `'1:command:(${commandNames.join(" ")})'`;
    case "words":
      // A single choice such as a shell or a doctor scope.
      return `'1${zshValue(completer, "argument")}'`;
    default:
      return `'*${zshValue(completer, "argument")}'`;
  }
}

function zshArguments(
  info: CommandInfo,
  indent: string,
  commandNames: readonly string[],
): string {
  const specs = zshOptionSpecs(info, `${indent}    `);
  const positional = zshPositional(info.positional, commandNames);
  if (positional) specs.push(`${indent}    ${positional}`);
  return `${indent}_arguments \\\n${specs.join(" \\\n")}`;
}

function generateZsh(tree: CommandInfo): string {
  const commandNames = tree.subcommands.flatMap((sub) => sub.names);
  const commandEntries = tree.subcommands.flatMap((sub) =>
    sub.names.map(
      (name) => `        '${name}:${zshDescription(sub.description)}'`,
    ),
  );
  const arms = tree.subcommands.map((sub) => {
    const pattern = sub.names.join("|");
    if (sub.subcommands.length === 0) {
      return `                ${pattern})\n${zshArguments(sub, "                    ", commandNames)}\n                    ;;`;
    }
    const nestedEntries = sub.subcommands.map(
      (nested) =>
        `                        '${nested.names[0]}:${zshDescription(nested.description)}'`,
    );
    const nestedArms = sub.subcommands.map(
      (nested) =>
        `                            ${nested.names.join("|")})\n${zshArguments(nested, "                                ", commandNames)}\n                                ;;`,
    );
    return `                ${pattern})
                    local -a subcommands
                    subcommands=(
${nestedEntries.join("\n")}
                    )
                    _arguments -C \\
                        '1: :->subcommand' \\
                        '*:: :->subargs'
                    case $state in
                        subcommand)
                            _describe -t subcommands '${sub.names[0]} subcommand' subcommands
                            ;;
                        subargs)
                            case $line[1] in
${nestedArms.join("\n")}
                            esac
                            ;;
                    esac
                    ;;`;
  });

  return `#compdef bpl
# Zsh completion script for bpl CLI.
# Generated by scripts/generate_completions.ts from the CLI's command
# definitions; do not edit by hand.
# Installation:
#   1. Copy this file to a directory in your $fpath (e.g., /usr/local/share/zsh/site-functions/_bpl)
#   2. Or run: bpl completion zsh > ~/.local/share/zsh/completions/_bpl
#      and add that directory to fpath in ~/.zshrc
#   3. Reload completions: rm -f ~/.zcompdump; compinit

_bpl() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    local -a commands
    commands=(
${commandEntries.join("\n")}
    )

    _arguments -C \\
${zshOptionSpecs(tree, "        ").join(" \\\n")} \\
        '1: :->command' \\
        '*:: :->args'

    case $state in
        command)
            _describe -t commands 'bpl command' commands
            _files -g "*.{bpl,x}"
            ;;
        args)
            case $line[1] in
${arms.join("\n")}
            esac
            ;;
    esac
}

_bpl "$@"
`;
}

// ---------------------------------------------------------------- main ----

const tree = await buildTree();
const bash = generateBash(tree);
const zsh = generateZsh(tree);
const embedded =
  "// Generated by scripts/generate_completions.ts; do not edit by hand.\n" +
  `export const bashCompletion = ${JSON.stringify(bash)};\n` +
  `export const zshCompletion = ${JSON.stringify(zsh)};\n`;

const outputs: Array<[string, string]> = [
  [resolve(root, "completions/bpl-completion.bash"), bash],
  [resolve(root, "completions/_bpl"), zsh],
  [resolve(root, "cli/completions/scripts.generated.ts"), embedded],
];

if (process.argv.includes("--check")) {
  const stale = outputs.filter(
    ([file, text]) => readFileSync(file, "utf8") !== text,
  );
  if (stale.length > 0) {
    throw new Error(
      `Completion scripts are out of date (${stale.map(([file]) => file).join(", ")}). Run bun scripts/generate_completions.ts.`,
    );
  }
} else {
  for (const [file, text] of outputs) writeFileSync(file, text);
}

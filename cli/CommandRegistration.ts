import type { Command } from "commander";

export type CliSubcommandGroup =
  | "run"
  | "runScript"
  | "dev"
  | "build"
  | "check"
  | "format"
  | "lint"
  | "package"
  | "completion"
  | "docs"
  | "new"
  | "clean"
  | "bindgen"
  | "doctor";

type RegistrationMode = CliSubcommandGroup | "all" | null;
type Registrar = (program: Command, version: string) => void;
type RegistrarLoader = () => Promise<Registrar>;

const GROUP_BY_COMMAND: Readonly<Record<string, CliSubcommandGroup>> = {
  run: "run",
  "run-script": "runScript",
  rs: "runScript",
  dev: "dev",
  build: "build",
  check: "check",
  format: "format",
  lint: "lint",
  pack: "package",
  install: "package",
  lock: "package",
  list: "package",
  init: "package",
  uninstall: "package",
  remove: "package",
  "package-cache": "package",
  completion: "completion",
  docs: "docs",
  new: "new",
  clean: "clean",
  bindgen: "bindgen",
  doctor: "doctor",
};

const REGISTRAR_LOADERS: Readonly<Record<CliSubcommandGroup, RegistrarLoader>> =
  {
    run: async () => {
      const { registerRunCommand } = await import("./commands/run");
      return (program) => registerRunCommand(program);
    },
    runScript: async () => {
      const { registerRunScriptCommand } = await import("./commands/runScript");
      return (program) => registerRunScriptCommand(program);
    },
    dev: async () => {
      const { registerDevCommand } = await import("./commands/dev");
      return (program) => registerDevCommand(program);
    },
    build: async () => {
      const { registerBuildCommand } = await import("./commands/build");
      return (program) => registerBuildCommand(program);
    },
    check: async () => {
      const { registerCheckCommand } = await import("./commands/check");
      return (program) => registerCheckCommand(program);
    },
    format: async () => {
      const { registerFormatCommand } = await import("./commands/format");
      return (program) => registerFormatCommand(program);
    },
    lint: async () => {
      const { registerLintCommand } = await import("./commands/lint");
      return (program) => registerLintCommand(program);
    },
    package: async () => {
      const { registerPackageCommands } = await import("./commands/package");
      return (program) => registerPackageCommands(program);
    },
    completion: async () => {
      const { registerCompletionCommand } =
        await import("./commands/completion");
      return (program) => registerCompletionCommand(program);
    },
    docs: async () => {
      const { registerDocsCommand } = await import("./commands/docs");
      return (program) => registerDocsCommand(program);
    },
    new: async () => {
      const { registerNewCommand } = await import("./commands/new");
      return (program) => registerNewCommand(program);
    },
    clean: async () => {
      const { registerCleanCommand } = await import("./commands/clean");
      return (program) => registerCleanCommand(program);
    },
    bindgen: async () => {
      const { registerBindgenCommand } = await import("./commands/bindgen");
      return (program) => registerBindgenCommand(program);
    },
    doctor: async () => {
      const { registerDoctorCommand } = await import("./commands/doctor");
      return (program, version) => registerDoctorCommand(program, version);
    },
  };

const ROOT_HELP_GROUPS: readonly CliSubcommandGroup[] = [
  "run",
  "runScript",
  "dev",
  "build",
  "check",
  "format",
  "lint",
  "package",
  "completion",
  "docs",
  "new",
  "clean",
  "bindgen",
  "doctor",
];

export function selectCliSubcommandGroup(
  program: Command,
  userArgs: string[],
): RegistrationMode {
  const parsed = program.parseOptions(userArgs);
  const firstOperand = parsed.operands[0];
  if (firstOperand) {
    const group = GROUP_BY_COMMAND[firstOperand];
    if (group) return group;
  }

  return parsed.unknown.includes("--help") || parsed.unknown.includes("-h")
    ? "all"
    : null;
}

export async function registerRequestedCliSubcommands(
  program: Command,
  userArgs: string[],
  version: string,
): Promise<void> {
  const group = selectCliSubcommandGroup(program, userArgs);
  if (!group) return;

  if (group !== "all") {
    const register = await REGISTRAR_LOADERS[group]();
    register(program, version);
    return;
  }

  const registrars = await Promise.all(
    ROOT_HELP_GROUPS.map((rootHelpGroup) => REGISTRAR_LOADERS[rootHelpGroup]()),
  );
  for (const register of registrars) {
    register(program, version);
  }
}

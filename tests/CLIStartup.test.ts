import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { Command } from "commander";
import { selectCliSubcommandGroup } from "../cli/CommandRegistration";

function createRootCommand(): Command {
  return new Command()
    .argument("[files...]")
    .option("-e, --eval <code>")
    .option("-q, --quiet")
    .option("--emit <type>")
    .option("--clang-flag <flag...>");
}

describe("CLI startup command registration", () => {
  test("selects only requested subcommand groups without mistaking option values for commands", () => {
    const command = createRootCommand();

    expect(selectCliSubcommandGroup(command, ["build", "--help"])).toBe(
      "build",
    );
    expect(selectCliSubcommandGroup(command, ["--quiet", "doctor"])).toBe(
      "doctor",
    );
    expect(selectCliSubcommandGroup(command, ["rs", "--list"])).toBe(
      "runScript",
    );
    expect(selectCliSubcommandGroup(command, ["remove", "demo"])).toBe(
      "package",
    );
    expect(selectCliSubcommandGroup(command, ["completion", "bash"])).toBe(
      "completion",
    );
    expect(selectCliSubcommandGroup(command, ["--eval", "build"])).toBeNull();
    expect(selectCliSubcommandGroup(command, ["--eval", "--help"])).toBeNull();
    expect(
      selectCliSubcommandGroup(command, ["--clang-flag", "--help"]),
    ).toBeNull();
    expect(selectCliSubcommandGroup(command, ["./build"])).toBeNull();
  });

  test("loads every subcommand only for root help", () => {
    const command = createRootCommand();

    expect(selectCliSubcommandGroup(command, ["--help"])).toBe("all");
    expect(selectCliSubcommandGroup(command, ["-h"])).toBe("all");
    expect(selectCliSubcommandGroup(command, ["--help", "build"])).toBe("all");
    expect(selectCliSubcommandGroup(command, ["build", "--help"])).toBe(
      "build",
    );
    expect(selectCliSubcommandGroup(command, ["--version"])).toBeNull();
    expect(selectCliSubcommandGroup(command, [])).toBeNull();
  });

  test("keeps the root entrypoint off eager command and compiler-runner imports", () => {
    const root = process.cwd();
    const indexSource = readFileSync(join(root, "index.ts"), "utf8");
    const registrationSource = readFileSync(
      join(root, "cli", "CommandRegistration.ts"),
      "utf8",
    );

    expect(indexSource).not.toContain('from "./cli"');
    expect(indexSource).not.toContain('from "./cli/CompilationRunner"');
    expect(indexSource).toContain("registerRequestedCliSubcommands");
    expect(registrationSource).toContain('import("./commands/package")');
    expect(registrationSource).toContain('import("./commands/doctor")');
  });

  test("keeps compile-backed command registration off eager action imports", () => {
    const commandSources = ["build", "run", "dev"].map((name) =>
      readFileSync(
        join(process.cwd(), "cli", "commands", `${name}.ts`),
        "utf8",
      ),
    );

    expect(commandSources[0]).not.toContain('from "../CompilationRunner"');
    expect(commandSources[0]).toContain('import("../CompilationRunner")');
    expect(commandSources[1]).not.toContain('from "../CompilationRunner"');
    expect(commandSources[1]).toContain('import("../CompilationRunner")');
    expect(commandSources[2]).not.toContain('from "../Watcher"');
    expect(commandSources[2]).toContain('import("../Watcher")');
  });

  test("keeps source-analysis command registration off the compiler barrel", () => {
    for (const name of ["check", "format", "lint"]) {
      const source = readFileSync(
        join(process.cwd(), "cli", "commands", `${name}.ts`),
        "utf8",
      );

      expect(source).not.toContain('from "../../compiler"');
      expect(source).toContain('import("../../compiler")');
    }
  });

  test("keeps the shared CLI diagnostic formatter off the compiler barrel", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "DiagnosticFormatter.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "../compiler"');
    expect(source).toContain('from "../compiler/common/DiagnosticFormatter"');
  });

  test("keeps completion registration on the focused path resolver import", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "completion.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "../../compiler"');
    expect(source).toContain('from "../../compiler/common/PathResolver"');
  });

  test("keeps doctor registration off eager package-manager loading", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "doctor.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "../../compiler"');
    expect(source).toContain(
      'import("../../compiler/middleend/PackageManager")',
    );
  });
});

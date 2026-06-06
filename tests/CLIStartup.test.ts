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

  test("keeps root help off the legacy command barrel", () => {
    const registrationSource = readFileSync(
      join(process.cwd(), "cli", "CommandRegistration.ts"),
      "utf8",
    );

    expect(registrationSource).not.toContain('import("./commands")');
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

  test("keeps check registration off action-only analysis dependencies", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "check.ts"),
      "utf8",
    );

    expect(source).toContain('import("./checkAction")');
    expect(source).toContain("Promise.all");
    expect(source).not.toContain('from "fs"');
    expect(source).not.toContain('from "../DiagnosticFormatter"');
    expect(source).not.toContain('from "../utils"');
    expect(source).not.toContain('from "../../compiler/common/Config"');
    expect(source).not.toContain('from "../../compiler/common/JsonContracts"');
    expect(source).not.toContain('from "../../compiler/common/Logger"');
  });

  test("keeps the JSON error registry on focused check contracts", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "JsonErrorCodes.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "./commands/check"');
    expect(source).toContain('from "./commands/CheckContracts"');
  });

  test("keeps lint registration off action-only analysis dependencies", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "lint.ts"),
      "utf8",
    );

    expect(source).toContain('import("./lintAction")');
    expect(source).toContain("Promise.all");
    expect(source).not.toContain('from "fs"');
    expect(source).not.toContain('from "../DiagnosticFormatter"');
    expect(source).not.toContain('from "../utils"');
    expect(source).not.toContain('from "../../compiler/common/JsonContracts"');
    expect(source).not.toContain('from "../../compiler/common/Logger"');
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

  test("keeps docs registration off eager documentation generator loading", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "docs.ts"),
      "utf8",
    );

    expect(source).not.toContain(
      'from "../../compiler/docs/DocumentationGenerator"',
    );
    expect(source).toMatch(
      /await import\(\s*"\.\.\/\.\.\/compiler\/docs\/DocumentationGenerator"\s*\)/,
    );
  });

  test("keeps doctor registration off eager package-manager loading", () => {
    const registrarSource = readFileSync(
      join(process.cwd(), "cli", "commands", "doctor.ts"),
      "utf8",
    );
    const actionSource = readFileSync(
      join(process.cwd(), "cli", "commands", "doctorAction.ts"),
      "utf8",
    );

    expect(registrarSource).not.toContain('from "../../compiler"');
    expect(actionSource).toContain(
      'import("../../compiler/middleend/PackageManager")',
    );
  });

  test("keeps doctor registration off action-only diagnostics", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "doctor.ts"),
      "utf8",
    );

    expect(source).toContain('import("./doctorAction")');
    expect(source).not.toContain('from "child_process"');
    expect(source).not.toContain('from "fs"');
    expect(source).not.toContain('from "../../compiler/common/LlvmVerifier"');
    expect(source).not.toContain(
      'from "../../compiler/common/SanitizerSupport"',
    );
    expect(source).not.toContain(
      'from "../../compiler/middleend/ObjectFileParser"',
    );
    expect(source).not.toContain('from "../WasmToolchain"');
  });

  test("keeps the JSON error registry on focused doctor contracts", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "JsonErrorCodes.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "./commands/doctor"');
    expect(source).toContain('from "./commands/DoctorContracts"');
  });

  test("keeps clean registration off action-only cleanup dependencies", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "clean.ts"),
      "utf8",
    );

    expect(source).toContain('import("./cleanAction")');
    expect(source).not.toContain('from "child_process"');
    expect(source).not.toContain('from "fs"');
    expect(source).not.toContain('from "path"');
    expect(source).not.toContain('from "../../compiler/common/Env"');
    expect(source).not.toContain('from "../../compiler/common/JsonContracts"');
    expect(source).not.toContain('from "../../compiler/common/Logger"');
    expect(source).not.toContain('from "../../compiler/common/PathSafety"');
  });

  test("keeps the JSON error registry on focused clean contracts", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "JsonErrorCodes.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "./commands/clean"');
    expect(source).toContain('from "./commands/CleanContracts"');
  });

  test("keeps bindgen registration off action-only parser dependencies", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "bindgen.ts"),
      "utf8",
    );

    expect(source).toContain('import("./bindgenAction")');
    expect(source).not.toContain('from "../../compiler/tools/CBindgen"');
    expect(source).not.toContain('from "../../compiler/common/JsonContracts"');
    expect(source).not.toContain('from "../../compiler/common/Logger"');
    expect(source).not.toContain('from "../utils"');
  });

  test("keeps the JSON error registry on focused bindgen contracts", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "JsonErrorCodes.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "./commands/bindgen"');
    expect(source).toContain('from "./commands/BindgenContracts"');
  });

  test("keeps new command registration off action-only scaffolding dependencies", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "new.ts"),
      "utf8",
    );

    expect(source).toContain('import("./newAction")');
    expect(source).not.toContain('from "fs"');
    expect(source).not.toContain('from "path"');
    expect(source).not.toContain('from "../../compiler/common/JsonContracts"');
    expect(source).not.toContain('from "../../compiler/common/Logger"');
    expect(source).not.toContain(
      'from "../../compiler/common/PackageManifestSchema"',
    );
    expect(source).not.toContain('from "../utils"');
  });

  test("keeps the JSON error registry on focused new command contracts", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "JsonErrorCodes.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "./commands/new"');
    expect(source).toContain('from "./commands/NewContracts"');
  });

  test("keeps package registration off broad and action-only compiler modules", () => {
    const source = readFileSync(
      join(process.cwd(), "cli", "commands", "package.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "../../compiler"');
    expect(source).toContain('import("../../compiler")');
    expect(source).not.toContain(
      'from "../../compiler/middleend/PackageManager"',
    );
    expect(source).toContain(
      'import("../../compiler/middleend/PackageManager")',
    );
    expect(source).toContain('from "../../compiler/middleend/PackageContracts"');
  });

  test("keeps package error class identity across focused and manager exports", async () => {
    const contracts = await import(
      "../compiler/middleend/PackageContracts"
    );
    const manager = await import("../compiler/middleend/PackageManager");

    expect(manager.PackageInstalledNameError).toBe(
      contracts.PackageInstalledNameError,
    );
    expect(manager.PackageLockVerificationError).toBe(
      contracts.PackageLockVerificationError,
    );
  });
});

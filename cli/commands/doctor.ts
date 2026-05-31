/**
 * Doctor Command Handler
 * Reports local toolchain and runtime readiness for BPL development.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { Command } from "commander";
import { getLlvmVerifierCandidates } from "../../compiler/common/LlvmVerifier";
import { getBplHome } from "../../compiler/common/PathResolver";
import { findSymlinkedParentPath } from "../../compiler/common/PathSafety";
import { Logger } from "../../compiler/common/Logger";
import { getCompilerDriver } from "../../compiler/common/CompilerDriver";
import {
  getTimeoutEnvDiagnostics,
  type TimeoutEnvDiagnostic,
} from "../../compiler/common/Env";
import { formatSpawnFailureReason } from "../../compiler/common/ProcessErrors";
import {
  explainBplSanitizerSupportFailure,
  SANITIZER_CLANG_FLAG,
  SANITIZER_RUNTIME_REPRO_COMMANDS,
  SANITIZER_RUNTIME_SUPPORT_ID,
  SANITIZER_RUNTIME_UNAVAILABLE_CODE,
} from "../../compiler/common/SanitizerSupport";
import { getObjectSymbolTool } from "../../compiler/middleend/ObjectFileParser";
import {
  getPackageArchiveTool,
  PackageManager,
  type PackageDependencyTreeNode,
  type PackageDoctorReport,
} from "../../compiler";
import { getWasmLinkerCandidates } from "../WasmToolchain";
import {
  CLI_JSON_CHECKS,
  CLI_JSON_SCHEMA_VERSION,
  createJsonReport,
} from "../../compiler/common/JsonContracts";

const log = new Logger("Doctor");
const DOCTOR_COMMAND_TIMEOUT_MS = 2000;
const DOCTOR_COMMAND_MAX_BUFFER = 1024 * 1024;
const RUNTIME_IR_HINT =
  "Run `bpl doctor` to inspect runtime assets, then reinstall BPL or restore the missing runtime IR from the release package.";
const NATIVE_RUNTIME_SUPPORT_HINT =
  "Run `bun run build:runtime`, then `bpl doctor`; reinstall BPL if runtime_support.o is still missing.";
const WASM_RUNTIME_HINT =
  "Run `bpl doctor` to inspect runtime assets, then reinstall BPL or restore the missing wasm runtime IR from the release package.";
const WASM_LINKER_HINT =
  "Install LLVM lld or set WASM_LD to a working wasm-ld binary before building wasm targets. When BPL_REQUIRE_WASM_LD is unset, missing wasm linker support is an optional prerequisite skip, not a successful wasm execution. Set BPL_REQUIRE_WASM_LD=1 when you want missing wasm linker support to fail instead of skipping runtime execution.";
const WASM_LINKER_UNAVAILABLE_CODE = "BPL_WASM_LINKER_UNAVAILABLE";
const DOCTOR_SCOPE_UNKNOWN_CODE = "BPL_DOCTOR_SCOPE_UNKNOWN";

interface DoctorCheck {
  id?: string;
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
  required?: boolean;
  code?: string;
  candidates?: string[];
  environment?: Record<string, string | null>;
  recommendedCommands?: string[];
}

interface DoctorReport {
  schemaVersion: typeof CLI_JSON_SCHEMA_VERSION;
  check: typeof CLI_JSON_CHECKS.toolchain;
  success: boolean;
  version: string;
  platform: {
    os: string;
    arch: string;
    node: string;
    bun?: string;
  };
  bplHome: string;
  checks: DoctorCheck[];
  timeouts: TimeoutEnvDiagnostic[];
}

export function registerDoctorCommand(program: Command, version: string): void {
  program
    .command("doctor [scope]")
    .description("Check local BPL toolchain and runtime setup")
    .option("--json", "output machine-readable diagnostics")
    .action((scope: string | undefined, options: { json?: boolean }, command: Command) => {
      const globalOpts = command.parent?.opts() || {};
      const outputJson = options.json || globalOpts.json;

      try {
        if (scope === "packages") {
          const report = new PackageManager(undefined, {
            ensureDirectories: false,
          }).doctorPackages();
          if (outputJson) {
            console.log(JSON.stringify(report, null, 2));
          } else {
            printPackageDoctorReport(report);
          }

          if (!report.ok) {
            process.exit(1);
          }
          return;
        }

        if (scope === "sanitizer") {
          const report = createSanitizerDoctorReport(version);
          if (outputJson) {
            console.log(JSON.stringify(report, null, 2));
          } else {
            printDoctorReport(report);
          }

          if (!report.success) {
            process.exit(1);
          }
          return;
        }

        if (scope) {
          const message = `Unknown doctor scope '${scope}'. Supported scopes: packages, sanitizer.`;
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.doctor, false, {
                  error: message,
                  errorCode: DOCTOR_SCOPE_UNKNOWN_CODE,
                }),
                null,
                2,
              ),
            );
            process.exit(1);
          }
          throw new Error(message);
        }

        const report = createDoctorReport(version);

        if (outputJson) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          printDoctorReport(report);
        }

        if (!report.success) {
          process.exit(1);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (outputJson) {
          console.log(
            JSON.stringify(
              createJsonReport(CLI_JSON_CHECKS.doctor, false, {
                error: message,
              }),
              null,
              2,
            ),
          );
        } else {
          log.error(message);
        }
        process.exit(1);
      }
    });
}

function createDoctorReport(version: string): DoctorReport {
  const bplHome = getBplHome();
  const checks: DoctorCheck[] = [
    checkDirectory(
      "BPL home",
      bplHome,
      "Set BPL_HOME to the BPL install root.",
    ),
    checkWritableDirectory(
      "Temporary directory",
      os.tmpdir(),
      "Set TMPDIR, TEMP, or TMP to a writable directory with enough free space.",
    ),
    checkFile(
      "Runtime IR",
      path.join(bplHome, "lib", "runtime.ll"),
      RUNTIME_IR_HINT,
    ),
    checkFile(
      "Runtime support object",
      path.join(bplHome, "lib", "runtime_support.o"),
      NATIVE_RUNTIME_SUPPORT_HINT,
    ),
    checkFile(
      "WebAssembly runtime IR",
      path.join(bplHome, "lib", "runtime_wasm.ll"),
      WASM_RUNTIME_HINT,
    ),
    checkFile(
      "Hosted WebAssembly runtime IR",
      path.join(bplHome, "lib", "runtime_wasm_host.ll"),
      WASM_RUNTIME_HINT,
    ),
    checkCommand(
      "native compiler",
      getCompilerDriver(),
      ["--version"],
      "Install clang/LLVM and add it to PATH, or set BPL_CC/CC to a working compiler driver.",
    ),
    checkSanitizerRuntimeSupport(),
    checkCommand(
      "wasm compiler",
      getCompilerDriver("wasm32-unknown-unknown"),
      ["--version"],
      "Install an LLVM compiler with wasm support, or set BPL_WASM_CC/WASM_CC to a working compiler driver.",
      false,
    ),
    checkCommand(
      "object symbol tool",
      getObjectSymbolTool(),
      ["--version"],
      "Install nm/llvm-nm, or set BPL_NM/NM to a working object symbol tool.",
      false,
    ),
    checkCommand(
      "package archive tool",
      getPackageArchiveTool(),
      ["--version"],
      "Install tar, or set BPL_TAR/TAR to a working package archive tool.",
      false,
    ),
    checkAnyCommand(
      "LLVM verifier",
      getLlvmVerifierCandidates().map((candidate) => [
        candidate.tool,
        ["--version"],
      ]),
      "Install opt, llvm-as, llc, or clang; or set BPL_OPT, BPL_LLVM_AS, BPL_LLC, or BPL_CC.",
      false,
    ),
    checkWasmLinker(),
  ];

  const bunVersion = getCommandVersion("bun", ["--version"]);

  return createJsonReport(
    CLI_JSON_CHECKS.toolchain,
    checks.every((check) => check.ok || check.required === false),
    {
      version,
      platform: {
        os: os.platform(),
        arch: os.arch(),
        node: process.version,
        ...(bunVersion ? { bun: bunVersion } : {}),
      },
      bplHome,
      checks,
      timeouts: getTimeoutEnvDiagnostics(),
    },
  );
}

function createSanitizerDoctorReport(version: string): DoctorReport {
  const bplHome = getBplHome();
  const checks = [checkSanitizerRuntimeSupport()];
  const bunVersion = getCommandVersion("bun", ["--version"]);

  return createJsonReport(
    CLI_JSON_CHECKS.toolchain,
    checks.every((check) => check.ok || check.required === false),
    {
      version,
      platform: {
        os: os.platform(),
        arch: os.arch(),
        node: process.version,
        ...(bunVersion ? { bun: bunVersion } : {}),
      },
      bplHome,
      checks,
      timeouts: getTimeoutEnvDiagnostics(),
    },
  );
}

function checkDirectory(
  name: string,
  directoryPath: string,
  hint: string,
): DoctorCheck {
  const linkStats = tryLstat(directoryPath);
  if (!linkStats) {
    return {
      name,
      ok: false,
      detail: `${directoryPath} not found`,
      hint,
      required: true,
    };
  }

  if (linkStats.isSymbolicLink() && !fs.existsSync(directoryPath)) {
    return {
      name,
      ok: false,
      detail: `${directoryPath} is a broken symbolic link`,
      hint,
      required: true,
    };
  }

  const symlinkedParent = findSymlinkedParentPath(directoryPath);
  if (symlinkedParent) {
    return {
      name,
      ok: false,
      detail: `${directoryPath} parent path contains a symbolic link: ${symlinkedParent}`,
      hint,
      required: true,
    };
  }

  if (!fs.statSync(directoryPath).isDirectory()) {
    return {
      name,
      ok: false,
      detail: `${directoryPath} is not a directory`,
      hint,
      required: true,
    };
  }

  return {
    name,
    ok: true,
    detail: directoryPath,
    required: true,
  };
}

function checkFile(name: string, filePath: string, hint: string): DoctorCheck {
  const linkStats = tryLstat(filePath);
  if (!linkStats) {
    return {
      name,
      ok: false,
      detail: `${filePath} not found`,
      hint,
      required: true,
    };
  }

  if (linkStats.isSymbolicLink() && !fs.existsSync(filePath)) {
    return {
      name,
      ok: false,
      detail: `${filePath} is a broken symbolic link`,
      hint,
      required: true,
    };
  }

  const symlinkedParent = findSymlinkedParentPath(filePath);
  if (symlinkedParent) {
    return {
      name,
      ok: false,
      detail: `${filePath} parent path contains a symbolic link: ${symlinkedParent}`,
      hint,
      required: true,
    };
  }

  if (!fs.statSync(filePath).isFile()) {
    return {
      name,
      ok: false,
      detail: `${filePath} is not a file`,
      hint,
      required: true,
    };
  }

  return {
    name,
    ok: true,
    detail: filePath,
    required: true,
  };
}

function checkWritableDirectory(
  name: string,
  directoryPath: string,
  hint: string,
): DoctorCheck {
  const directoryCheck = checkDirectory(name, directoryPath, hint);
  if (!directoryCheck.ok) {
    return directoryCheck;
  }

  let probeDir: string | undefined;
  try {
    probeDir = fs.mkdtempSync(path.join(directoryPath, "bpl-doctor-"));
    fs.writeFileSync(path.join(probeDir, "write-test"), "ok");

    return {
      name,
      ok: true,
      detail: `${directoryPath} is writable`,
      required: true,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: `${directoryPath} is not writable: ${formatFileSystemError(error)}`,
      hint,
      required: true,
    };
  } finally {
    if (probeDir) {
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
  }
}

function formatFileSystemError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}

function checkCommand(
  name: string,
  command: string,
  args: string[],
  hint: string,
  required = true,
): DoctorCheck {
  const result = spawnSync(command, args, getCommandProbeOptions());
  const commandDetail = formatCommandResult(command, result);
  const detail = `${command}: ${commandDetail}`;

  return result.status === 0
    ? {
        name,
        ok: true,
        detail,
        required,
      }
    : {
        name,
        ok: false,
        detail,
        hint,
        required,
      };
}

function checkAnyCommand(
  name: string,
  candidates: Array<[string | undefined, string[]]>,
  hint: string,
  required = true,
): DoctorCheck {
  const failures: string[] = [];

  for (const [command, args] of candidates) {
    if (!command) continue;
    const result = spawnSync(command, args, getCommandProbeOptions());
    if (result.status === 0) {
      const detail =
        result.stdout?.split("\n")[0]?.trim() ||
        result.stderr?.split("\n")[0]?.trim() ||
        command;
      return {
        name,
        ok: true,
        detail: `${command}: ${detail}`,
        required,
      };
    }
    failures.push(`${command}: ${formatCommandResult(command, result)}`);
  }

  return {
    name,
    ok: false,
    detail: failures.length > 0 ? failures.join("; ") : "not found on PATH",
    hint,
    required,
  };
}

function checkWasmLinker(): DoctorCheck {
  const candidates = getWasmLinkerCandidates();
  const check = checkAnyCommand(
    "wasm linker",
    candidates.map((candidate) => [candidate, ["--version"]]),
    WASM_LINKER_HINT,
    false,
  );

  if (check.ok) {
    return check;
  }

  return {
    ...check,
    code: WASM_LINKER_UNAVAILABLE_CODE,
    candidates,
    environment: {
      WASM_LD: process.env.WASM_LD ?? null,
      BPL_REQUIRE_WASM_LD: process.env.BPL_REQUIRE_WASM_LD ?? null,
    },
    recommendedCommands: ["BPL_REQUIRE_WASM_LD=1 bun run test:wasm"],
  };
}

function checkSanitizerRuntimeSupport(): DoctorCheck {
  const compiler = getCompilerDriver();
  const environment = {
    BPL_CC: process.env.BPL_CC ?? null,
    CC: process.env.CC ?? null,
  };
  let probeDir: string | undefined;

  try {
    probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-doctor-sanitizer-"));
    const sourcePath = path.join(probeDir, "sanitizer_probe.c");
    const outputPath = path.join(probeDir, "sanitizer_probe");
    fs.writeFileSync(sourcePath, "int main(void) { return 0; }\n");

    const result = spawnSync(
      compiler,
      ["-x", "c", sourcePath, SANITIZER_CLANG_FLAG, "-o", outputPath],
      getCommandProbeOptions(),
    );

    if (result.status === 0) {
      return {
        id: SANITIZER_RUNTIME_SUPPORT_ID,
        name: "sanitizer runtime support",
        ok: true,
        detail: `${compiler}: ${SANITIZER_CLANG_FLAG} probe passed`,
        required: false,
        environment,
      };
    }

    return {
      id: SANITIZER_RUNTIME_SUPPORT_ID,
      name: "sanitizer runtime support",
      ok: false,
      detail: `${compiler}: ${formatCommandResult(compiler, result)}`,
      hint: explainBplSanitizerSupportFailure(
        {
          stdout: String(result.stdout ?? ""),
          stderr: String(result.stderr ?? ""),
          exitCode: result.status ?? -1,
        },
        SANITIZER_RUNTIME_REPRO_COMMANDS,
      ),
      required: false,
      code: SANITIZER_RUNTIME_UNAVAILABLE_CODE,
      environment,
      recommendedCommands: [...SANITIZER_RUNTIME_REPRO_COMMANDS],
    };
  } catch (error) {
    return {
      id: SANITIZER_RUNTIME_SUPPORT_ID,
      name: "sanitizer runtime support",
      ok: false,
      detail: `${compiler}: sanitizer probe could not run: ${formatFileSystemError(error)}`,
      hint: "Install the Clang compiler-rt runtime package that provides libclang_rt ASan/UBSan libraries for this target, then run `bun run test:sanitizers`.",
      required: false,
      code: SANITIZER_RUNTIME_UNAVAILABLE_CODE,
      environment,
      recommendedCommands: [...SANITIZER_RUNTIME_REPRO_COMMANDS],
    };
  } finally {
    if (probeDir) {
      fs.rmSync(probeDir, { recursive: true, force: true });
    }
  }
}

function getCommandVersion(name: string, args: string[]): string | undefined {
  const result = spawnSync(name, args, getCommandProbeOptions());
  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout.trim().split("\n")[0];
}

function formatCommandResult(
  command: string,
  result: ReturnType<typeof spawnSync>,
): string {
  return (
    getFirstOutputLine(result.stdout) ||
    getFirstOutputLine(result.stderr) ||
    formatSpawnError(result.error) ||
    `${command} exited with status ${result.status ?? "unknown"}`
  );
}

function getCommandProbeOptions(): {
  encoding: BufferEncoding;
  timeout: number;
  maxBuffer: number;
} {
  return {
    encoding: "utf-8",
    timeout: DOCTOR_COMMAND_TIMEOUT_MS,
    maxBuffer: DOCTOR_COMMAND_MAX_BUFFER,
  };
}

function getFirstOutputLine(output: string | Buffer | null | undefined): string {
  return output?.toString().split("\n")[0]?.trim() || "";
}

function formatSpawnError(error: Error | undefined): string | undefined {
  return formatSpawnFailureReason(error);
}

function printDoctorReport(report: DoctorReport): void {
  console.log(`BPL ${report.version}`);
  console.log(
    `Platform: ${report.platform.os}/${report.platform.arch} node=${report.platform.node}`,
  );
  if (report.platform.bun) {
    console.log(`Bun: ${report.platform.bun}`);
  }
  console.log(`BPL_HOME: ${report.bplHome}`);
  console.log("");
  console.log("Timeouts:");
  for (const timeout of report.timeouts) {
    const status = timeout.isValid ? "OK" : "WARN";
    const effective =
      timeout.effectiveMs === null ? "none" : `${timeout.effectiveMs}ms`;
    const source =
      timeout.raw === null
        ? "default"
        : timeout.isValid
          ? `env: ${timeout.raw}`
          : `invalid: ${timeout.raw}`;
    console.log(`${status} ${timeout.name}: ${effective} (${source})`);
    if (!timeout.isValid) {
      console.log(
        `  hint: invalid value ignored; expected a positive integer; ${timeout.fallbackAction}`,
      );
    }
  }
  console.log("");

  for (const check of report.checks) {
    const status = check.ok ? "OK" : check.required === false ? "WARN" : "FAIL";
    console.log(`${status} ${check.name}: ${check.detail}`);
    if (!check.ok && check.hint) {
      console.log(`  hint: ${check.hint}`);
    }
  }
}

function printPackageDoctorReport(report: PackageDoctorReport): void {
  console.log(`Package doctor: ${report.ok ? "OK" : "FAIL"}`);
  console.log(`Project: ${report.projectRoot}`);
  console.log(`Local packages: ${report.localPackageDir}`);
  console.log(`Package cache: ${report.globalPackageDir}`);
  console.log(
    `Lockfile: ${report.lockfile.exists ? `${report.lockfile.packages} package(s)` : "missing"}`,
  );
  console.log(`Installed packages: ${report.installedPackages.length}`);
  console.log(`Cached archives: ${report.cacheEntries.length}`);
  console.log(
    `Cache provenance: ${report.cacheVerification.ok ? "OK" : "WARN"} (${report.cacheVerification.entriesChecked} archive(s) checked)`,
  );

  if (report.dependencyTree.length > 0) {
    console.log("");
    console.log("Dependency tree:");
    for (const line of formatDependencyTree(report.dependencyTree)) {
      console.log(line);
    }
  }

  if (report.issues.length > 0) {
    console.log("");
    console.log("Issues:");
    for (const issue of report.issues) {
      console.log(`${issue.severity.toUpperCase()} ${issue.message}`);
      if (issue.path) {
        console.log(`  path: ${issue.path}`);
      }
      if (issue.hint) {
        console.log(`  hint: ${issue.hint}`);
      }
    }
  }
}

function formatDependencyTree(nodes: PackageDependencyTreeNode[]): string[] {
  const lines: string[] = [];

  const visit = (node: PackageDependencyTreeNode, depth: number) => {
    const indent = "  ".repeat(depth);
    const version = node.version ? `@${node.version}` : "";
    const missing = node.installed ? "" : " (missing)";
    const locked = node.locked ? " [locked]" : "";
    const source = node.source ? ` <- ${node.source}` : "";
    lines.push(`${indent}${node.name}${version}${missing}${locked}${source}`);

    for (const problem of node.problems) {
      lines.push(`${indent}  ! ${problem}`);
    }

    for (const dependency of node.dependencies) {
      visit(dependency, depth + 1);
    }
  };

  for (const node of nodes) {
    visit(node, 1);
  }

  return lines;
}

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
import { Logger } from "../../compiler/common/Logger";
import { getCompilerDriver } from "../../compiler/common/CompilerDriver";
import { getObjectSymbolTool } from "../../compiler/middleend/ObjectFileParser";
import {
  getPackageArchiveTool,
  PackageManager,
  type PackageDependencyTreeNode,
  type PackageDoctorReport,
} from "../../compiler";

const log = new Logger("Doctor");

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
  required?: boolean;
}

interface DoctorReport {
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
}

export function registerDoctorCommand(program: Command, version: string): void {
  program
    .command("doctor [scope]")
    .description("Check local BPL toolchain and runtime setup")
    .option("--json", "output machine-readable diagnostics")
    .action((scope: string | undefined, options: { json?: boolean }, command: Command) => {
      try {
        const globalOpts = command.parent?.opts() || {};
        const outputJson = options.json || globalOpts.json;

        if (scope === "packages") {
          const report = new PackageManager().doctorPackages();
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

        if (scope) {
          throw new Error(
            `Unknown doctor scope '${scope}'. Supported scopes: packages.`,
          );
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
        log.error(`${e instanceof Error ? e.message : String(e)}`);
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
    checkFile(
      "Runtime IR",
      path.join(bplHome, "lib", "runtime.ll"),
      "Run `bun run build:runtime` or reinstall BPL.",
    ),
    checkFile(
      "Runtime support object",
      path.join(bplHome, "lib", "runtime_support.o"),
      "Run `bun run build:runtime` or reinstall BPL.",
    ),
    checkFile(
      "WebAssembly runtime IR",
      path.join(bplHome, "lib", "runtime_wasm.ll"),
      "Reinstall BPL or restore lib/runtime_wasm.ll from the release package.",
    ),
    checkFile(
      "Hosted WebAssembly runtime IR",
      path.join(bplHome, "lib", "runtime_wasm_host.ll"),
      "Reinstall BPL or restore lib/runtime_wasm_host.ll from the release package.",
    ),
    checkCommand(
      "native compiler",
      getCompilerDriver(),
      ["--version"],
      "Install clang/LLVM and add it to PATH, or set BPL_CC/CC to a working compiler driver.",
    ),
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
    checkAnyCommand(
      "wasm linker",
      [
        [process.env.WASM_LD, ["--version"]],
        ["wasm-ld", ["--version"]],
        ["wasm-ld-18", ["--version"]],
        ["wasm-ld-17", ["--version"]],
        ["wasm-ld-16", ["--version"]],
        ["ld.lld", ["--version"]],
      ],
      "Install LLVM lld or set WASM_LD to a working wasm-ld binary before building wasm targets.",
      false,
    ),
  ];

  const bunVersion = getCommandVersion("bun", ["--version"]);

  return {
    success: checks.every((check) => check.ok || check.required === false),
    version,
    platform: {
      os: os.platform(),
      arch: os.arch(),
      node: process.version,
      ...(bunVersion ? { bun: bunVersion } : {}),
    },
    bplHome,
    checks,
  };
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
  const result = spawnSync(command, args, { encoding: "utf-8" });
  const commandDetail =
    result.stdout?.split("\n")[0]?.trim() ||
    result.stderr?.split("\n")[0]?.trim() ||
    result.error?.message ||
    `${command} exited with status ${result.status ?? "unknown"}`;
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
    const result = spawnSync(command, args, { encoding: "utf-8" });
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
    failures.push(`${command}: ${result.status ?? result.error?.message ?? "unavailable"}`);
  }

  return {
    name,
    ok: false,
    detail: failures.length > 0 ? failures.join("; ") : "not found on PATH",
    hint,
    required,
  };
}

function getCommandVersion(name: string, args: string[]): string | undefined {
  const result = spawnSync(name, args, { encoding: "utf-8" });
  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout.trim().split("\n")[0];
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

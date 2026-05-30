/**
 * Doctor Command Handler
 * Reports local toolchain and runtime readiness for BPL development.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import { Command } from "commander";
import { getBplHome } from "../../compiler/common/PathResolver";
import { Logger } from "../../compiler/common/Logger";
import {
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
    checkPath("BPL home", bplHome, "Set BPL_HOME to the BPL install root."),
    checkPath(
      "Runtime IR",
      path.join(bplHome, "lib", "runtime.ll"),
      "Run `bun run build:runtime` or reinstall BPL.",
    ),
    checkPath(
      "Runtime support object",
      path.join(bplHome, "lib", "runtime_support.o"),
      "Run `bun run build:runtime` or reinstall BPL.",
    ),
    checkPath(
      "WebAssembly runtime IR",
      path.join(bplHome, "lib", "runtime_wasm.ll"),
      "Reinstall BPL or restore lib/runtime_wasm.ll from the release package.",
    ),
    checkPath(
      "Hosted WebAssembly runtime IR",
      path.join(bplHome, "lib", "runtime_wasm_host.ll"),
      "Reinstall BPL or restore lib/runtime_wasm_host.ll from the release package.",
    ),
    checkCommand(
      "clang",
      ["--version"],
      "Install clang/LLVM and add it to PATH.",
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

function checkPath(name: string, filePath: string, hint: string): DoctorCheck {
  return fs.existsSync(filePath)
    ? {
        name,
        ok: true,
        detail: filePath,
        required: true,
      }
    : {
        name,
        ok: false,
        detail: `${filePath} not found`,
        hint,
        required: true,
      };
}

function checkCommand(
  name: string,
  args: string[],
  hint: string,
  required = true,
): DoctorCheck {
  const result = spawnSync(name, args, { encoding: "utf-8" });
  const detail =
    result.stdout?.split("\n")[0]?.trim() ||
    result.stderr?.split("\n")[0]?.trim() ||
    `${name} exited with status ${result.status ?? "unknown"}`;

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

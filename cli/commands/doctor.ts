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

const log = new Logger("Doctor");

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
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
    .command("doctor")
    .description("Check local BPL toolchain and runtime setup")
    .option("--json", "output machine-readable diagnostics")
    .action((options: { json?: boolean }, command: Command) => {
      try {
        const globalOpts = command.parent?.opts() || {};
        const outputJson = options.json || globalOpts.json;
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
    checkCommand(
      "clang",
      ["--version"],
      "Install clang/LLVM and add it to PATH.",
    ),
  ];

  const bunVersion = getCommandVersion("bun", ["--version"]);

  return {
    success: checks.every((check) => check.ok),
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
      }
    : {
        name,
        ok: false,
        detail: `${filePath} not found`,
        hint,
      };
}

function checkCommand(name: string, args: string[], hint: string): DoctorCheck {
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
      }
    : {
        name,
        ok: false,
        detail,
        hint,
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
    console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
    if (!check.ok && check.hint) {
      console.log(`  hint: ${check.hint}`);
    }
  }
}

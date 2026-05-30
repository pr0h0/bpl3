import { spawnSync } from "child_process";
import { rmSync } from "fs";
import { basename, dirname, join } from "path";
import { getCompilerDriver } from "./CompilerDriver";

export interface LlvmVerifierResult {
  tool: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface LlvmVerifierOptions {
  cwd?: string;
  timeout?: number;
}

export interface LlvmVerifierCandidate {
  tool: string;
  args: (irPath: string, outputPath: string) => string[];
}

const VERIFY_TIMEOUT_MS = 30000;

export function getLlvmVerifierCandidates(): LlvmVerifierCandidate[] {
  return [
    {
      tool: process.env.BPL_OPT || process.env.OPT || "opt",
      args: (irPath) => ["-passes=verify", "-disable-output", irPath],
    },
    {
      tool: process.env.BPL_LLVM_AS || process.env.LLVM_AS || "llvm-as",
      args: (irPath, outputPath) => [irPath, "-o", outputPath],
    },
    {
      tool: process.env.BPL_LLC || process.env.LLC || "llc",
      args: (irPath, outputPath) => [
        "-filetype=null",
        irPath,
        "-o",
        outputPath,
      ],
    },
    {
      tool: getCompilerDriver(),
      args: (irPath, outputPath) => [
        "-Wno-override-module",
        "-c",
        irPath,
        "-o",
        outputPath,
      ],
    },
  ];
}

export function verifyLlvmFile(
  irPath: string,
  options: LlvmVerifierOptions = {},
): LlvmVerifierResult {
  const cwd = options.cwd ?? dirname(irPath);
  const timeout = options.timeout ?? VERIFY_TIMEOUT_MS;

  for (const candidate of getLlvmVerifierCandidates()) {
    if (!isToolAvailable(candidate.tool, cwd, timeout)) {
      continue;
    }

    const outputPath = join(
      cwd,
      `${basename(irPath)}.${formatVerifierToolName(candidate.tool)}.verify.out`,
    );
    const args = candidate.args(irPath, outputPath);
    const result = spawnSync(candidate.tool, args, {
      cwd,
      encoding: "utf8",
      timeout,
      maxBuffer: 1024 * 1024 * 16,
    });

    rmSync(outputPath, { force: true });

    return {
      tool: candidate.tool,
      args,
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? result.error?.message ?? ""),
      exitCode: result.status ?? -1,
    };
  }

  return {
    tool: "none",
    args: [],
    stdout: "",
    stderr:
      "No LLVM verifier tool found. Install opt, llvm-as, llc, or clang, or set BPL_OPT/BPL_LLVM_AS/BPL_LLC/BPL_CC.",
    exitCode: -1,
  };
}

function formatVerifierToolName(tool: string): string {
  return basename(tool).replace(/[^A-Za-z0-9_.-]/g, "_");
}

function isToolAvailable(
  tool: string,
  cwd: string,
  timeout: number,
): boolean {
  const result = spawnSync(tool, ["--version"], {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 1024 * 1024,
  });

  return result.error === undefined && result.status === 0;
}

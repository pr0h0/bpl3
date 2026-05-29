import { spawnSync } from "child_process";
import { rmSync } from "fs";
import { basename, dirname, join } from "path";

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

interface LlvmVerifierCandidate {
  tool: string;
  args: (irPath: string, outputPath: string) => string[];
}

const VERIFY_TIMEOUT_MS = 30000;

const VERIFIER_CANDIDATES: LlvmVerifierCandidate[] = [
  {
    tool: "opt",
    args: (irPath) => ["-passes=verify", "-disable-output", irPath],
  },
  {
    tool: "llvm-as",
    args: (irPath, outputPath) => [irPath, "-o", outputPath],
  },
  {
    tool: "llc",
    args: (irPath, outputPath) => [
      "-filetype=null",
      irPath,
      "-o",
      outputPath,
    ],
  },
  {
    tool: "clang",
    args: (irPath, outputPath) => [
      "-Wno-override-module",
      "-c",
      irPath,
      "-o",
      outputPath,
    ],
  },
];

export function verifyLlvmFile(
  irPath: string,
  options: LlvmVerifierOptions = {},
): LlvmVerifierResult {
  const cwd = options.cwd ?? dirname(irPath);
  const timeout = options.timeout ?? VERIFY_TIMEOUT_MS;

  for (const candidate of VERIFIER_CANDIDATES) {
    if (!isToolAvailable(candidate.tool, cwd, timeout)) {
      continue;
    }

    const outputPath = join(
      cwd,
      `${basename(irPath)}.${candidate.tool}.verify.out`,
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
      "No LLVM verifier tool found. Install opt, llvm-as, llc, or clang.",
    exitCode: -1,
  };
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

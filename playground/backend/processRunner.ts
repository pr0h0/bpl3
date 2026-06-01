import { spawn } from "child_process";

export interface RunProcessFileOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeout?: number;
  maxBuffer?: number;
}

export interface RunProcessFileResult {
  stdout: string;
  stderr: string;
}

export interface RunProcessFileError extends Error {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  signal?: NodeJS.Signals | null;
  killed?: boolean;
}

function isBenignStdinError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EPIPE" || code === "ERR_STREAM_DESTROYED";
}

export function formatProcessCommand(command: string, args: string[]): string {
  return [command, ...args].map((arg) => JSON.stringify(arg)).join(" ");
}

export function runProcessFile(
  command: string,
  args: string[],
  options: RunProcessFileOptions = {},
): Promise<RunProcessFileResult> {
  const maxBuffer = options.maxBuffer ?? 1024 * 1024;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout =
      options.timeout === undefined
        ? undefined
        : setTimeout(() => {
            const error = new Error(
              `Process timed out after ${options.timeout}ms`,
            ) as RunProcessFileError;
            error.killed = true;
            fail(error);
            child.kill();
          }, options.timeout);

    function cleanup() {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    function fail(error: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      const processError = error as RunProcessFileError;
      processError.stdout = stdout;
      processError.stderr = stderr;
      reject(processError);
    }

    function appendOutput(
      streamName: "stdout" | "stderr",
      chunk: Buffer | string,
    ): void {
      if (settled) {
        return;
      }
      const text = String(chunk);
      if (streamName === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }

      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxBuffer) {
        fail(new Error(`Process output exceeded maxBuffer ${maxBuffer}`));
        child.kill();
      }
    }

    child.stdout.on("data", (chunk) => appendOutput("stdout", chunk));
    child.stderr.on("data", (chunk) => appendOutput("stderr", chunk));
    child.stdin.on("error", (error) => {
      if (!isBenignStdinError(error)) {
        fail(error);
      }
    });
    child.on("error", fail);
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      cleanup();
      if (code === 0) {
        settled = true;
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(
        `Process exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
      ) as RunProcessFileError;
      error.stdout = stdout;
      error.stderr = stderr;
      error.code = code;
      error.signal = signal;
      settled = true;
      reject(error);
    });

    try {
      child.stdin.end(options.input ?? "");
    } catch (error) {
      if (!isBenignStdinError(error)) {
        fail(error as Error);
      }
    }
  });
}

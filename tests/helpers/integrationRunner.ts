import { spawn } from "child_process";
import * as os from "os";

export interface RunProcessOptions {
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeout?: number;
}

export interface RunProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function createLimiter(maxConcurrent: number) {
  const limit = Math.max(1, Math.floor(maxConcurrent));
  const queue: Array<() => void> = [];
  let active = 0;

  const drain = () => {
    if (active >= limit) return;
    const next = queue.shift();
    if (next) next();
  };

  return function limitTask<T>(task: () => Promise<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active += 1;
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            drain();
          });
      };

      queue.push(run);
      drain();
    });
  };
}

export function getIntegrationJobs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const requested = Number(env.BPL_INTEGRATION_JOBS);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.floor(requested);
  }

  const available =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length;

  return Math.max(1, Math.min(available, 8));
}

export function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions = {},
): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timer =
      options.timeout && options.timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, options.timeout)
        : null;

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });

    child.once("close", (status, signal) => {
      if (timer) clearTimeout(timer);
      resolve({
        status,
        signal,
        stdout,
        stderr,
        timedOut,
      });
    });

    child.stdin?.end(options.input || "");
  });
}

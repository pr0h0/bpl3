import { spawn, type ChildProcess } from "node:child_process";
import { getOptionalPositiveIntegerEnv } from "../compiler/common/Env";

interface RunningProgram {
  child: ChildProcess;
  completed: Promise<void>;
  timeout?: ReturnType<typeof setTimeout>;
  failed: boolean;
}

/** Own the dev session's program without blocking file-change events. */
export class WatchProgramRunner {
  private current?: RunningProgram;
  private stopping?: Promise<void>;

  constructor(
    private readonly reportError: (message: string) => void,
    private readonly reportWarning: (message: string) => void = reportError,
  ) {}

  start(executable: string, args: string[]): void {
    if (this.current || this.stopping)
      throw new Error(
        "The previous watch program must stop before restarting.",
      );
    const timeout = getOptionalPositiveIntegerEnv("BPL_RUN_TIMEOUT_MS", {
      warn: this.reportWarning,
      fallbackAction: "running without timeout",
    });
    let child: ChildProcess;
    try {
      child = spawn(executable, args, { stdio: "inherit" });
    } catch (error) {
      this.reportError(
        `Failed to run executable ${executable}: ${String(error)}`,
      );
      return;
    }
    let complete!: () => void;
    const completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const running: RunningProgram = { child, completed, failed: false };
    this.current = running;
    child.once("error", (error) => {
      running.failed = true;
      if (this.current === running)
        this.reportError(
          `Failed to run executable ${executable}: ${error.message}`,
        );
    });
    child.once("close", (code, signal) => {
      clearTimeout(running.timeout);
      if (this.current === running) {
        this.current = undefined;
        if (!running.failed && code !== 0)
          this.reportError(
            signal
              ? `Program exited with signal ${signal}`
              : `Program exited with code ${code}`,
          );
      }
      complete();
    });
    if (timeout !== undefined)
      running.timeout = setTimeout(() => {
        if (this.current !== running) return;
        this.reportError(`Executable timed out: ${executable}`);
        void this.stop();
      }, timeout);
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const running = this.current;
    if (!running) return Promise.resolve();
    this.current = undefined;
    clearTimeout(running.timeout);
    const kill = (signal: NodeJS.Signals) => {
      try {
        running.child.kill(signal);
      } catch (error) {
        this.reportError(`Failed to stop watch program: ${String(error)}`);
      }
    };
    const force = setTimeout(() => kill("SIGKILL"), 1000);
    kill("SIGTERM");
    this.stopping = running.completed.finally(() => {
      clearTimeout(force);
      this.stopping = undefined;
    });
    return this.stopping;
  }
}

import { randomUUID } from "crypto";
import { runProcessFile } from "./processRunner";
import type { CompileRequest, CompileResponse } from "./protocol";
import type { HostedWasmCompileResponse } from "./wasmResponseCache";

export type PlaygroundOperation = "compile" | "wasm" | "format";
export type PlaygroundResult = CompileResponse &
  Partial<HostedWasmCompileResponse> & { code?: string };
export const DEFAULT_WORKER_IMAGE = "bpl-playground-worker:local";

export class RunnerError extends Error {
  constructor(
    message: string,
    public readonly status = 503,
  ) {
    super(message);
  }
}

export function getRunnerMode(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.BPL_PLAYGROUND_RUNNER ?? "docker";
  if (mode !== "docker" && mode !== "host") {
    throw new Error("BPL_PLAYGROUND_RUNNER must be docker or host.");
  }
  return mode;
}

/** A fresh container owns every file and process associated with a request. */
export class DockerPlaygroundRunner {
  private active = 0;
  private unavailable = false;
  private imageId?: string;

  constructor(
    private readonly image = DEFAULT_WORKER_IMAGE,
    private readonly run: typeof runProcessFile = runProcessFile,
  ) {}

  async prepare(): Promise<void> {
    try {
      const info = await this.run(
        "docker",
        ["info", "--format", "{{.OSType}}"],
        {
          timeout: 10_000,
        },
      );
      if (info.stdout.trim() !== "linux") {
        throw new Error("Linux containers are required");
      }
      const image = await this.run(
        "docker",
        ["image", "inspect", "--format", "{{.Id}}", this.image],
        { timeout: 10_000 },
      );
      const imageId = image.stdout.trim();
      if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) {
        throw new Error("Invalid worker image ID");
      }
      this.imageId = imageId;
    } catch (error) {
      throw new RunnerError(
        `Docker playground unavailable. Start Docker and run bun run playground:build. ` +
          `Expected image: ${this.image}. For trusted local development only, explicitly set BPL_PLAYGROUND_RUNNER=host. ` +
          String(error),
      );
    }
  }

  async execute(
    operation: PlaygroundOperation,
    request: CompileRequest,
  ): Promise<PlaygroundResult> {
    if (!this.imageId || this.unavailable) {
      throw new RunnerError(
        "Docker runner unavailable; restart after checking Docker.",
      );
    }
    if (this.active >= 2) {
      throw new RunnerError(
        "Playground busy; retry when a running job finishes.",
        429,
      );
    }
    this.active++;
    const name = `bpl-playground-${randomUUID()}`;
    try {
      // Create separately so start failure/timeout cannot leave an unnamed job.
      await this.run(
        "docker",
        [
          "create",
          "--name",
          name,
          "--label",
          "bpl.playground.worker=true",
          "--pull=never",
          "--rm",
          "--init=false",
          "--interactive",
          "--network=none",
          "--read-only",
          "--user=10001:10001",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--memory=768m",
          "--memory-swap=768m",
          "--cpus=1",
          "--pids-limit=64",
          "--ulimit=nofile=256:256",
          "--ulimit=core=0:0",
          "--log-driver=none",
          "--tmpfs=/tmp:rw,exec,nosuid,nodev,size=128m,mode=1777",
          this.imageId,
        ],
        { timeout: 10_000, maxBuffer: 1024 * 1024 },
      );
      const result = await this.run(
        "docker",
        ["start", "--attach", "--interactive", name],
        {
          input: JSON.stringify({ operation, request }),
          timeout: 35_000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      const response: unknown = JSON.parse(result.stdout);
      if (
        !response ||
        typeof response !== "object" ||
        !("success" in response) ||
        typeof response.success !== "boolean"
      ) {
        throw new Error("Invalid worker response");
      }
      return response as PlaygroundResult;
    } catch (error) {
      if (error instanceof RunnerError) throw error;
      // Do not expose Docker daemon details or host configuration to visitors.
      throw new RunnerError(
        "Playground worker failed or exceeded its time, memory, or output limit.",
        502,
      );
    } finally {
      try {
        await this.run("docker", ["rm", "--force", name], {
          timeout: 10_000,
          maxBuffer: 1024 * 1024,
        });
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        if (!stderr.includes("No such container")) {
          this.unavailable = true;
          throw new RunnerError(
            "Worker cleanup failed; check Docker and restart the playground.",
          );
        }
      } finally {
        this.active--;
      }
    }
  }
}

export async function createPlaygroundRunner(
  env: NodeJS.ProcessEnv = process.env,
) {
  const mode = getRunnerMode(env);
  if (mode === "docker") {
    const runner = new DockerPlaygroundRunner(env.BPL_PLAYGROUND_IMAGE);
    await runner.prepare();
    return { mode, execute: runner.execute.bind(runner) };
  }
  // Importing the compiler is deliberately restricted to explicit host mode.
  const engine = await import("./engine");
  return {
    mode,
    async execute(
      operation: PlaygroundOperation,
      request: CompileRequest,
    ): Promise<PlaygroundResult> {
      if (operation === "format") return engine.formatCode(request);
      if (operation === "wasm") return engine.compileToWasm(request);
      return engine.compileAndRun(request);
    },
  };
}

import { randomUUID } from "crypto";
import { runProcessFile } from "./processRunner";
import type { CompileRequest, CompileResponse } from "./protocol";
import type { HostedWasmCompileResponse } from "./wasmResponseCache";

export type PlaygroundOperation = "compile" | "wasm" | "format";
export type PlaygroundResult = CompileResponse &
  Partial<HostedWasmCompileResponse> & { code?: string };
export const DEFAULT_WORKER_IMAGE = "bpl-playground-worker:local";
const WORKER_LEASE_MS = 60_000;

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
  private pendingCleanup = new Set<string>();
  private recovery?: Promise<void>;

  constructor(
    private readonly image = DEFAULT_WORKER_IMAGE,
    private readonly run: typeof runProcessFile = runProcessFile,
  ) {}

  get ready(): boolean {
    return Boolean(this.imageId) && !this.unavailable;
  }

  private async remove(name: string): Promise<void> {
    try {
      await this.run("docker", ["rm", "--force", name], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      if (!(error as { stderr?: string }).stderr?.includes("No such container"))
        throw error;
    }
    this.pendingCleanup.delete(name);
  }

  /** Only expired, labelled playground jobs and this controller's failed cleanups. */
  recover(): Promise<void> {
    if (this.recovery) return this.recovery;
    this.recovery = (async () => {
      try {
        for (const name of this.pendingCleanup) await this.remove(name);
        const jobs = await this.run(
          "docker",
          [
            "ps",
            "--all",
            "--filter",
            "label=bpl.playground.worker=true",
            "--format",
            '{{.ID}} {{.Label "bpl.playground.expires"}}',
          ],
          { timeout: 10_000, maxBuffer: 1024 * 1024 },
        );
        for (const line of jobs.stdout.trim().split("\n")) {
          const match = /^([a-f0-9]{12,64}) (\d+)$/.exec(line);
          if (match && Number(match[2]) <= Date.now())
            await this.remove(match[1]!);
        }
        this.unavailable = this.pendingCleanup.size > 0;
      } catch (error) {
        this.unavailable = true;
        throw error;
      } finally {
        this.recovery = undefined;
      }
    })();
    return this.recovery;
  }

  async prepare(): Promise<void> {
    this.imageId = undefined;
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
      await this.recover();
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
          "--label",
          `bpl.playground.expires=${Date.now() + WORKER_LEASE_MS}`,
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
        await this.remove(name);
      } catch (error) {
        this.pendingCleanup.add(name);
        this.unavailable = true;
        throw new RunnerError(
          "Worker cleanup failed; waiting for Docker recovery.",
        );
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
    return {
      mode,
      execute: runner.execute.bind(runner),
      recover: () => runner.recover(),
      ready: () => runner.ready,
    };
  }
  // Importing the compiler is deliberately restricted to explicit host mode.
  const engine = await import("./engine");
  return {
    mode,
    recover: async () => {},
    ready: () => true,
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

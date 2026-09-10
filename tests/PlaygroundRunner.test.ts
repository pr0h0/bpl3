import { describe, expect, test } from "bun:test";
import {
  DockerPlaygroundRunner,
  getRunnerMode,
  RunnerError,
} from "../playground/backend/runner";
import { validateCompileRequestPayload } from "../playground/backend/protocol";
import type {
  runProcessFile,
  RunProcessFileOptions,
} from "../playground/backend/processRunner";

const imageId = `sha256:${"a".repeat(64)}`;
type Call = {
  command: string;
  args: string[];
  options?: RunProcessFileOptions;
};
function harness(
  handler?: (
    call: Call,
  ) => Promise<{ stdout: string; stderr: string }> | undefined,
) {
  const calls: Call[] = [];
  const run: typeof runProcessFile = async (command, args, options) => {
    const call = { command, args, options };
    calls.push(call);
    const override = handler?.(call);
    if (override) return override;
    return {
      stdout:
        args[0] === "info"
          ? "linux\n"
          : args[0] === "image"
            ? imageId
            : args[0] === "start"
              ? '{"success":true,"output":"ok"}'
              : "",
      stderr: "",
    };
  };
  return { calls, runner: new DockerPlaygroundRunner(undefined, run) };
}

describe("playground runner", () => {
  test("never starts pre-cancelled work and waits for create before removing cancelled work", async () => {
    const controller = new AbortController();
    const { runner, calls } = harness(({ args }) => {
      if (args[0] === "create") {
        controller.abort();
        return Promise.resolve({ stdout: "created", stderr: "" });
      }
    });
    await runner.prepare();
    await expect(
      runner.execute("compile", { code: "" }, AbortSignal.abort()),
    ).rejects.toMatchObject({ status: 499 });
    expect(calls.some(({ args }) => args[0] === "create")).toBe(false);
    await expect(
      runner.execute("compile", { code: "" }, controller.signal),
    ).rejects.toMatchObject({ status: 499 });
    expect(calls.some(({ args }) => args[0] === "start")).toBe(false);
    expect(calls.at(-1)!.args.slice(0, 2)).toEqual(["rm", "--force"]);
  });
  test("defaults to Docker and requires explicit valid host selection", () => {
    expect(getRunnerMode({})).toBe("docker");
    expect(getRunnerMode({ BPL_PLAYGROUND_RUNNER: "host" })).toBe("host");
    expect(() => getRunnerMode({ BPL_PLAYGROUND_RUNNER: "auto" })).toThrow();
    expect(() => getRunnerMode({ BPL_PLAYGROUND_RUNNER: "" })).toThrow();
  });

  test("fails closed if Docker or its image is unavailable", async () => {
    for (const failingStep of ["info", "image"]) {
      const { runner, calls } = harness(({ args }) =>
        args[0] === failingStep
          ? Promise.reject(new Error("unavailable"))
          : undefined,
      );
      await expect(runner.prepare()).rejects.toThrow(
        "Docker playground unavailable",
      );
      await expect(
        runner.execute("compile", { code: "" }),
      ).rejects.toBeInstanceOf(RunnerError);
      expect(calls.some(({ args }) => args[0] === "create")).toBe(false);
    }
  });

  test("sends source as data and applies limits without host mounts or secrets", async () => {
    const { runner, calls } = harness();
    await runner.prepare();
    const request = { code: "$(touch /host-file)", args: ["--privileged"] };
    expect(await runner.execute("compile", request)).toEqual({
      success: true,
      output: "ok",
    });
    const create = calls.find(({ args }) => args[0] === "create")!;
    for (const flag of [
      "--network=none",
      "--init=false",
      "--read-only",
      "--user=10001:10001",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--memory=768m",
      "--memory-swap=768m",
      "--cpus=1",
      "--pids-limit=64",
      "--log-driver=none",
    ])
      expect(create.args).toContain(flag);
    expect(create.args.at(-1)).toBe(imageId);
    expect(create.args.join(" ")).not.toMatch(
      /--volume|--mount|--env|--privileged|host-file/,
    );
    const start = calls.find(({ args }) => args[0] === "start")!;
    expect(JSON.parse(start.options!.input!)).toEqual({
      operation: "compile",
      request,
    });
    expect(start.options!.timeout).toBe(35_000);
    expect(start.options!.maxBuffer).toBe(16 * 1024 * 1024);
    expect(calls.at(-1)!.args).toEqual(["rm", "--force", create.args[2]!]);
  });

  test("removes jobs after create/start failure, timeout, and malformed responses", async () => {
    for (const step of ["create", "start", "invalid-json", "invalid-shape"]) {
      const { runner, calls } = harness(({ args }) => {
        if (args[0] === step)
          return Promise.reject(new Error("timeout or output limit"));
        if (args[0] === "start" && step.startsWith("invalid"))
          return Promise.resolve({
            stdout: step === "invalid-json" ? "bad JSON" : '{"success":"yes"}',
            stderr: "",
          });
      });
      await runner.prepare();
      await expect(runner.execute("wasm", { code: "" })).rejects.toThrow(
        "worker failed",
      );
      expect(calls.at(-1)!.args.slice(0, 2)).toEqual(["rm", "--force"]);
    }
  });

  test("stops accepting work after cleanup failure", async () => {
    const { runner, calls } = harness(({ args }) =>
      args[0] === "rm" ? Promise.reject(new Error("daemon down")) : undefined,
    );
    await runner.prepare();
    await expect(runner.execute("compile", { code: "" })).rejects.toThrow(
      "cleanup failed",
    );
    const count = calls.length;
    await expect(runner.execute("compile", { code: "" })).rejects.toThrow(
      "unavailable",
    );
    expect(calls.length).toBe(count);
  });

  test("recovers cleanup after a Docker outage before accepting new jobs", async () => {
    let offline = false;
    const { runner, calls } = harness(({ args }) =>
      offline && (args[0] === "rm" || args[0] === "ps")
        ? Promise.reject(new Error("daemon unavailable"))
        : undefined,
    );
    await runner.prepare();
    offline = true;
    await expect(runner.execute("compile", { code: "" })).rejects.toThrow(
      "cleanup failed",
    );
    expect(runner.ready).toBe(false);
    await expect(runner.recover()).rejects.toThrow();
    offline = false;
    await runner.recover();
    expect(runner.ready).toBe(true);
    await expect(
      runner.execute("compile", { code: "" }),
    ).resolves.toMatchObject({ success: true });
    expect(calls.filter(({ args }) => args[0] === "rm").length).toBe(4);
  });

  test("reaps only expired labelled jobs and serializes concurrent recovery calls", async () => {
    const old = "a".repeat(12),
      current = "b".repeat(12);
    const { runner, calls } = harness(({ args }) =>
      args[0] === "ps"
        ? Promise.resolve({
            stdout: `${old} 1\n${current} ${Date.now() + 60000}\n${"c".repeat(12)}\nbad-name 1\n`,
            stderr: "",
          })
        : undefined,
    );
    await runner.prepare();
    expect(
      calls.filter(({ args }) => args[0] === "rm").map(({ args }) => args[2]),
    ).toEqual([old]);
    const first = runner.recover();
    expect(runner.recover()).toBe(first);
    await first;
  });

  test("reports unavailable when its pinned image disappears and never silently changes images", async () => {
    let removed = false;
    const { runner, calls } = harness(({ args }) =>
      args[0] === "image" && removed
        ? Promise.reject(new Error("image removed"))
        : undefined,
    );
    await runner.prepare();
    removed = true;
    await expect(runner.recover()).rejects.toThrow("image removed");
    expect(runner.ready).toBe(false);
    expect(calls.at(-1)!.args.at(-1)).toBe(imageId);
    await expect(runner.execute("compile", { code: "" })).rejects.toMatchObject(
      { status: 503 },
    );
  });

  test("bounds concurrency and releases capacity after jobs finish", async () => {
    const pending: Array<() => void> = [];
    const { runner } = harness(({ args }) =>
      args[0] === "start"
        ? new Promise((resolve) =>
            pending.push(() =>
              resolve({ stdout: '{"success":true}', stderr: "" }),
            ),
          )
        : undefined,
    );
    await runner.prepare();
    const jobs = [
      runner.execute("format", { code: "" }),
      runner.execute("compile", { code: "" }),
    ];
    await expect(runner.execute("compile", { code: "" })).rejects.toMatchObject(
      { status: 429 },
    );
    pending.forEach((finish) => finish());
    await Promise.all(jobs);
    const next = runner.execute("compile", { code: "" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending.at(-1)!();
    await expect(next).resolves.toEqual({ success: true });
  });

  test("validates UTF-8 byte budgets and argv before starting work", () => {
    for (const body of [
      { code: "é".repeat(128 * 1024) },
      { code: "", input: "x".repeat(256 * 1024 + 1) },
      { code: "", args: ["a\0b"] },
      { code: "", args: ["x".repeat(4097)] },
      { code: "", args: Array(65).fill("") },
    ])
      expect(validateCompileRequestPayload(body).success).toBe(false);
    const result = validateCompileRequestPayload({
      code: "",
      runner: "host",
      image: "evil",
      args: ["--privileged"],
    });
    expect(result).toEqual({
      success: true,
      request: {
        code: "",
        args: ["--privileged"],
        input: undefined,
        includeArtifacts: undefined,
        execute: undefined,
      },
    });
  });
});

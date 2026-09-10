import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "child_process";
import { DockerPlaygroundRunner } from "../playground/backend/runner";
import { runProcessFile } from "../playground/backend/processRunner";

const dockerTests =
  process.env.BPL_TEST_DOCKER === "1" ? describe : describe.skip;
const hello =
  'extern printf(fmt: string, ...) ret int; frame main() ret int { printf("Docker hello\\n"); return 0; }';
const runner = new DockerPlaygroundRunner(process.env.BPL_PLAYGROUND_IMAGE);

dockerTests("real Docker playground workers", () => {
  beforeAll(async () => {
    await runner.prepare();
  }, 25_000);

  test("compiles and executes with current stdin and literal argv", async () => {
    const code = `extern getchar() ret int; extern printf(fmt: string, ...) ret int;
      frame main(argc: int, argv: **char) ret int {
        printf("%d %s %c\\n", argc, argv[1], getchar()); return 0;
      }`;
    const result = await runner.execute("compile", {
      code,
      input: "Z",
      args: ["$(touch /tmp/injected)"],
    });
    expect(result).toMatchObject({
      success: true,
      output: "2 $(touch /tmp/injected) Z\n",
    });
    expect(result.ir).toBeUndefined();
  }, 45_000);

  test("formats and returns compile-only artifacts without executing", async () => {
    const formatted = await runner.execute("format", { code: hello });
    expect(formatted.success).toBe(true);
    expect(formatted.code).toContain("frame main()");
    const compiled = await runner.execute("compile", {
      code: hello,
      execute: false,
      includeArtifacts: true,
    });
    expect(compiled.success).toBe(true);
    expect(compiled.ir).toContain("@main");
    expect(JSON.parse(compiled.ast!).kind).toBe("Program");
    expect(Array.isArray(JSON.parse(compiled.tokens!))).toBe(true);
    expect(compiled.output).toBeUndefined();
  }, 60_000);

  test("builds valid hosted Wasm inside the worker", async () => {
    const result = await runner.execute("wasm", { code: hello });
    expect(result.success).toBe(true);
    const module = new WebAssembly.Module(
      Buffer.from(result.wasmBase64!, "base64"),
    );
    expect(
      WebAssembly.Module.exports(module).some((entry) => entry.name === "main"),
    ).toBe(true);
    expect(result.wasmBytes).toBeGreaterThan(0);
  }, 45_000);

  test("blocks host files, secrets, privilege gain, and network interfaces", async () => {
    process.env.BPL_TEST_HOST_SECRET = "must-not-enter-worker";
    try {
      const result = await runner.execute("compile", {
        code: `
        extern system(cmd: string) ret int;
        frame main() ret int {
          return system("test $(id -u) = 10001 && test -z \\"$BPL_TEST_HOST_SECRET\\" && test ! -e /var/run/docker.sock && test $(ls /sys/class/net | wc -l) = 1 && test -e /sys/class/net/lo && test ! -w /app/package.json && test ! -w /usr && grep -q 'NoNewPrivs:.*1' /proc/self/status && grep -q 'CapEff:.*0000000000000000' /proc/self/status && echo isolated");
        }
      `,
      });
      expect(result).toMatchObject({ success: true, output: "isolated\n" });
    } finally {
      delete process.env.BPL_TEST_HOST_SECRET;
    }
  }, 45_000);

  test("bounds native output and time, then accepts a fresh job", async () => {
    const noisy = await runner.execute("compile", {
      code: 'extern puts(s: string) ret int; frame main() ret int { loop { puts("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"); } return 0; }',
    });
    expect(noisy.success).toBe(false);
    expect(noisy.error).toContain("maxBuffer");
    const looping = await runner.execute("compile", {
      code: "frame main() ret int { loop {} return 0; }",
    });
    expect(looping.success).toBe(false);
    expect(looping.error).toContain("timeout");
    expect(await runner.execute("compile", { code: hello })).toMatchObject({
      success: true,
      output: "Docker hello\n",
    });
  }, 60_000);

  test("PID 1 watchdog survives a program stopping its compiler parent and kills descendants", async () => {
    const names: string[] = [];
    const tracked = new DockerPlaygroundRunner(
      process.env.BPL_PLAYGROUND_IMAGE,
      async (command, args, options) => {
        if (args[0] === "create") names.push(args[args.indexOf("--name") + 1]!);
        return runProcessFile(command, args, options);
      },
    );
    await tracked.prepare();
    const started = Date.now();
    await expect(
      tracked.execute("compile", {
        code: `
      extern kill(pid: int, signal: int) ret int;
      extern getppid() ret int;
      extern fork() ret int;
      extern setsid() ret int;
      frame main() ret int { kill(1, 19); kill(getppid(), 19); if (fork() == 0) { setsid(); } loop {} return 0; }
    `,
      }),
    ).rejects.toThrow("worker failed");
    expect(Date.now() - started).toBeLessThan(35_000);
    const remaining = await runProcessFile("docker", [
      "ps",
      "-aq",
      "--filter",
      `name=^/${names[0]}$`,
    ]);
    expect(remaining.stdout.trim()).toBe("");
  }, 45_000);
});

dockerTests("Docker playground HTTP routing", () => {
  let server: ChildProcess;
  const port = 40000 + (process.pid % 10000);
  const base = `http://127.0.0.1:${port}`;
  beforeAll(async () => {
    server = spawn("bun", ["playground/backend/server.ts"], {
      env: {
        ...process.env,
        PORT: String(port),
        BPL_PLAYGROUND_RUNNER: "docker",
      },
      stdio: "ignore",
    });
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(`${base}/health`)).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Docker playground did not start");
  }, 25_000);
  afterAll(() => {
    server?.kill();
  });

  test("exposes runner mode and routes all compiler endpoints through Docker", async () => {
    expect(await (await fetch(`${base}/health`)).json()).toMatchObject({
      runner: "docker",
    });
    for (const endpoint of ["compile", "wasm", "format"]) {
      const response = await fetch(`${base}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ code: hello, runner: "host" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ success: true });
    }
  }, 90_000);

  test("rejects oversized source and malformed format requests before dispatch", async () => {
    for (const body of [{ code: "x".repeat(128 * 1024 + 1) }, { code: 42 }]) {
      const response = await fetch(`${base}/format`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ success: false });
    }
  });
});

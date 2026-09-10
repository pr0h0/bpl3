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

  test("recovers an expired container left between create and start, without touching an unexpired job", async () => {
    const names = [
      `bpl-playground-orphan-${process.pid}`,
      `bpl-playground-live-${process.pid}`,
    ];
    try {
      for (const [i, name] of names.entries())
        await runProcessFile("docker", [
          "create",
          "--name",
          name,
          "--label",
          "bpl.playground.worker=true",
          "--label",
          `bpl.playground.expires=${i === 0 ? 1 : Date.now() + 60000}`,
          process.env.BPL_PLAYGROUND_IMAGE || "bpl-playground-worker:local",
        ]);
      await runner.recover();
      for (const [i, name] of names.entries()) {
        const found = await runProcessFile("docker", [
          "ps",
          "-aq",
          "--filter",
          `name=^/${name}$`,
        ]);
        expect(Boolean(found.stdout.trim())).toBe(i === 1);
      }
      expect(await runner.execute("compile", { code: hello })).toMatchObject({
        success: true,
      });
    } finally {
      for (const name of names)
        await runProcessFile("docker", ["rm", "-f", name]).catch(() => {});
    }
  }, 45_000);

  test("survives tmpfs exhaustion and process exhaustion with fresh workspaces", async () => {
    const disk = await runner.execute("compile", {
      code: `extern system(cmd: string) ret int;
      frame main() ret int { return system("dd if=/dev/zero of=/tmp/fill bs=1M count=256 2>/dev/null; test $(stat -c %s /tmp/fill) -lt 268435456 && echo bounded"); }`,
    });
    expect(disk).toMatchObject({ success: true, output: "bounded\n" });
    const processes = await runner.execute("compile", {
      code: `
      extern fork() ret int; extern sleep(seconds: uint) ret uint;
      extern printf(fmt: string, ...) ret int;
      frame main() ret int {
        local count: int = 0;
        loop (count < 128) {
          local pid: int = fork();
          if (pid == 0) { sleep(2); return 0; }
          if (pid < 0) { printf("bounded %d\\n", count); return 0; }
          count += 1;
        }
        return 1;
      }`,
    });
    expect(processes.success).toBe(true);
    const count = Number(/bounded (\d+)/.exec(processes.output || "")?.[1]);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(64);
    expect(await runner.execute("compile", { code: hello })).toMatchObject({
      success: true,
    });
  }, 60_000);

  test("contains memory exhaustion, removes the job, and accepts another job", async () => {
    const outcome = await runner
      .execute("compile", {
        code: `
      extern malloc(size: ulong) ret *char;
      extern memset(ptr: *char, value: int, size: ulong) ret *char;
      frame main() ret int {
        loop { local data: *char = malloc(16777216); if (data == nullptr) { return 1; } memset(data, 1, 16777216); }
        return 0;
      }`,
      })
      .catch(() => ({ success: false }));
    expect(outcome.success).toBe(false);
    expect(await runner.execute("compile", { code: hello })).toMatchObject({
      success: true,
    });
  }, 60_000);

  test("recovers a real abandoned container after a simulated Docker transport outage", async () => {
    let offline = false;
    let injected = false;
    let name = "";
    const recovering = new DockerPlaygroundRunner(
      process.env.BPL_PLAYGROUND_IMAGE,
      async (command, args, options) => {
        if (offline) throw new Error("Docker transport disconnected");
        const result = await runProcessFile(command, args, options);
        if (args[0] === "create" && !injected) {
          name = args[args.indexOf("--name") + 1]!;
          offline = true;
          injected = true;
        }
        return result;
      },
    );
    try {
      await recovering.prepare();
      await expect(
        recovering.execute("compile", { code: hello }),
      ).rejects.toThrow("cleanup failed");
      expect(recovering.ready).toBe(false);
      await expect(recovering.recover()).rejects.toThrow("disconnected");
      const abandoned = await runProcessFile("docker", [
        "ps",
        "-aq",
        "--filter",
        `name=^/${name}$`,
      ]);
      expect(abandoned.stdout.trim()).not.toBe("");
      offline = false;
      await recovering.recover();
      expect(recovering.ready).toBe(true);
      const cleaned = await runProcessFile("docker", [
        "ps",
        "-aq",
        "--filter",
        `name=^/${name}$`,
      ]);
      expect(cleaned.stdout.trim()).toBe("");
      expect(
        await recovering.execute("compile", { code: hello }),
      ).toMatchObject({ success: true });
    } finally {
      if (name)
        await runProcessFile("docker", ["rm", "-f", name]).catch(() => {});
    }
  }, 45000);

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

  test("disconnect cancels its worker and one client cannot occupy both slots", async () => {
    const controller = new AbortController();
    const pending = fetch(`${base}/compile`, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({
        code: "frame main() ret int { loop {} return 0; }",
      }),
    }).catch((error) => error);
    // Wait for the HTTP request to own its slot and the container to be running.
    const deadline = Date.now() + 10000;
    let worker = "";
    while (Date.now() < deadline) {
      const jobs = await runProcessFile("docker", [
        "ps",
        "-q",
        "--filter",
        "label=bpl.playground.worker=true",
      ]);
      if (jobs.stdout.trim()) {
        worker = jobs.stdout.trim().split("\n")[0]!;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    try {
      expect(worker).not.toBe("");
      const rejected = await fetch(`${base}/compile`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.123" },
        body: JSON.stringify({ code: hello }),
      });
      expect(rejected.status).toBe(429);
      expect(rejected.headers.get("retry-after")).toBe("3");
    } finally {
      controller.abort();
      await pending;
    }
    const stopped = Date.now() + 3000;
    let remaining = worker;
    while (Date.now() < stopped && remaining) {
      remaining = (
        await runProcessFile("docker", [
          "ps",
          "-aq",
          "--filter",
          `id=${worker}`,
        ])
      ).stdout.trim();
      if (remaining) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(remaining).toBe("");
    const next = await fetch(`${base}/compile`, {
      method: "POST",
      body: JSON.stringify({ code: hello }),
    });
    expect(await next.json()).toMatchObject({ success: true });
  }, 30000);
});

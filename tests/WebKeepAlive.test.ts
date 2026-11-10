import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { join, resolve } from "node:path";
import { makeRepoTempDir } from "./helpers/repoTempDir";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((done) => probe.close(() => done()));
  return address.port;
}

// Writes `parts` (pausing between them) and collects everything the server
// sends until it closes the connection.
function exchange(
  port: number,
  parts: string[],
  pauseMs = 50,
): Promise<{ text: string; elapsed: number }> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const socket = connect(port, "127.0.0.1");
    const chunks: Buffer[] = [];
    socket.setTimeout(8000, () => socket.destroy(new Error("timeout")));
    socket.on("error", reject);
    socket.on("data", (data) => chunks.push(data));
    socket.on("close", () =>
      resolve({
        text: Buffer.concat(chunks).toString(),
        elapsed: performance.now() - started,
      }),
    );
    socket.on("connect", async () => {
      for (const part of parts) {
        socket.write(part);
        await Bun.sleep(pauseMs);
      }
    });
  });
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

test.skipIf(process.platform !== "linux")(
  "keep-alive serves several and pipelined requests per connection without blocking other clients",
  async () => {
    const dir = makeRepoTempDir("keep-alive-");
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      writeFileSync(
        join(dir, "main.bpl"),
        String.raw`
import [App], [Request], [Response] from "bpl-express";
extern atoi(text: string) ret int;
frame initialize() {}
frame hello(req: *Request, res: *Response) {
    res.text(req.path);
}
frame main(argc: int, argv: *string) ret int {
    if (argc != 3) { return 2; }
    local app: App = App.new();
    app.keepAlive(3, 1);
    app.router.get("/*", hello);
    if (atoi(argv[2]) == 0) {
        app.listenOn(atoi(argv[1]), "127.0.0.1");
    } else {
        app.listenWorkers(atoi(argv[1]), "127.0.0.1", 1, initialize);
    }
    return 0;
}`,
      );
      const exe = join(dir, "server");
      const build = spawnSync(
        "bun",
        [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      for (const mode of ["0", "1"]) {
        const port = await freePort();
        child = Bun.spawn([exe, String(port), mode], {
          stdout: "ignore",
          stderr: "pipe",
        });
        let ready = false;
        for (let i = 0; i < 200 && !ready; i++) {
          try {
            ready = (
              await exchange(port, [
                "GET /ping HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
              ])
            ).text.includes("200");
          } catch {
            await Bun.sleep(20);
          }
        }
        expect(ready).toBe(true);

        // Three requests share one connection; the last one (the limit)
        // announces close.
        const get = (path: string) => `GET ${path} HTTP/1.1\r\nHost: x\r\n\r\n`;
        let result = await exchange(port, [get("/a"), get("/b"), get("/c")]);
        expect(count(result.text, "HTTP/1.1 200")).toBe(3);
        expect(count(result.text, "Connection: keep-alive")).toBe(2);
        expect(count(result.text, "Connection: close")).toBe(1);
        expect(result.text).toContain("\r\n\r\n/a");
        expect(result.text.endsWith("/c")).toBe(true);
        expect(result.elapsed).toBeLessThan(900);

        // Pipelined requests in one write are answered in order.
        result = await exchange(port, [get("/one") + get("/two")]);
        expect(result.text.indexOf("/one")).toBeLessThan(
          result.text.indexOf("/two"),
        );
        expect(count(result.text, "HTTP/1.1 200")).toBe(2);

        // Connection: close and HTTP/1.0 without keep-alive close at once.
        result = await exchange(port, [
          "GET /x HTTP/1.1\r\nHost: x\r\nConnection: Close\r\n\r\n" + get("/y"),
        ]);
        expect(count(result.text, "HTTP/1.1 200")).toBe(1);
        result = await exchange(port, ["GET /old HTTP/1.0\r\n\r\n"]);
        expect(result.text).toContain("Connection: close");
        expect(result.elapsed).toBeLessThan(900);

        // An idle kept connection closes after the idle timeout, while
        // another client is served meanwhile.
        const idle = exchange(port, [
          "GET /old HTTP/1.0\r\nConnection: keep-alive\r\n\r\n",
        ]);
        await Bun.sleep(150);
        const other = await exchange(port, [
          "GET /other HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n",
        ]);
        expect(other.text).toContain("/other");
        expect(other.elapsed).toBeLessThan(500);
        const idled = await idle;
        expect(idled.text).toContain("Connection: keep-alive");
        expect(idled.elapsed).toBeGreaterThan(900);
        expect(idled.elapsed).toBeLessThan(4000);

        // A bad request on a kept connection is answered and closes it.
        result = await exchange(port, [get("/ok"), "BROKEN\r\n\r\n"]);
        expect(count(result.text, "HTTP/1.1 200")).toBe(1);
        expect(result.text).toContain("HTTP/1.1 400");
        child.kill("SIGTERM");
        await child.exited;
        child = undefined;
      }
    } finally {
      child?.kill("SIGKILL");
      rmSync(dir, { force: true, recursive: true });
    }
  },
  120000,
);

test("keep-alive limits are validated and stay off by default", () => {
  const dir = makeRepoTempDir("keep-alive-limits-");
  try {
    writeFileSync(
      join(dir, "main.bpl"),
      String.raw`
import [App] from "bpl-express";
frame main() ret int {
    local app: App = App.new();
    if (app.keep_alive_requests != 1) { return 1; }
    local caught: int = 0;
    try { app.keepAlive(1, 5); } catch { caught = caught + 1; }
    try { app.keepAlive(10001, 5); } catch { caught = caught + 1; }
    try { app.keepAlive(10, 0); } catch { caught = caught + 1; }
    try { app.keepAlive(10, 301); } catch { caught = caught + 1; }
    app.keepAlive(100, 5);
    if (caught != 4 || app.keep_alive_requests != 100) { return 2; }
    app.destroy();
    return 0;
}`,
    );
    const run = spawnSync(
      "bun",
      [resolve("index.ts"), "run", join(dir, "main.bpl")],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}, 90000);

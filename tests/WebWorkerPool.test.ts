import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { createServer, createConnection } from "node:net";
import { makeRepoTempDir } from "./helpers/repoTempDir";

test.skipIf(process.platform !== "linux")(
  "bounded process workers isolate slow clients and enforce total request deadlines",
  async () => {
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const port = address.port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const dir = makeRepoTempDir("web-worker-test-");
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      writeFileSync(
        join(dir, "main.bpl"),
        `import [App],[Request],[Response] from "bpl-express";
      frame initialize(){}frame health(_req:*Request,res:*Response){res.text("ready");}
      frame main(){local app:App=App.new();app.timeout_seconds=5;app.request_timeout_seconds=2;app.router.get("/",health);app.listenWorkers(${port},"127.0.0.1",2,initialize);}`,
      );
      const exe = join(dir, "server");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          join(dir, "main.bpl"),
          "-O",
          "3",
          "-o",
          exe,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      child = Bun.spawn([exe], { stdout: "ignore", stderr: "pipe" });
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/`)).ok) break;
        } catch {}
        await Bun.sleep(20);
      }
      const slow = createConnection({ host: "127.0.0.1", port });
      const chunks: Buffer[] = [];
      slow.on("data", (chunk) => chunks.push(chunk));
      slow.on("error", () => {});
      await new Promise<void>((resolve) =>
        slow.on("connect", () => {
          slow.write("GET / HTTP/1.1\r\nHost: x\r\n");
          resolve();
        }),
      );
      const before = performance.now();
      const interval = setInterval(() => slow.write("X"), 150);
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        expect(await response.text()).toBe("ready");
        expect(performance.now() - before).toBeLessThan(1500);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            slow.destroy();
            reject(new Error("Total deadline did not stop trickled request"));
          }, 5000);
          slow.on("close", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        expect(Buffer.concat(chunks).toString()).toContain("408");
        expect(performance.now() - before).toBeLessThan(3500);
        expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(200);
      } finally {
        clearInterval(interval);
        slow.destroy();
      }
    } finally {
      child?.kill();
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

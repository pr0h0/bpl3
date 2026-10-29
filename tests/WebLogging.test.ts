import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { makeRepoTempDir } from "./helpers/repoTempDir";

test.skipIf(process.platform !== "linux")(
  "completion middleware logs generated IDs and routes without request secrets",
  async () => {
    const dir = makeRepoTempDir("web-log-test-");
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      const probe = createServer();
      await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
      const address = probe.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const port = address.port;
      await new Promise<void>((done) => probe.close(() => done()));
      writeFileSync(join(dir, "index.html"), "fixture");
      writeFileSync(
        join(dir, "main.bpl"),
        `
import [App],[Request],[Response] from "bpl-express";
import requestId,accessLog from "bpl-web-middleware";
extern strcmp(a:string,b:string)ret int;
frame okay(req:*Request,res:*Response){res.text(req.peerAddress());}
frame fail(_req:*Request,_res:*Response){throw "exception-secret";}
frame gate(req:*Request,res:*Response){if(strcmp(req.path,"/blocked")==0){res.status(429).text("blocked");}}
frame badObserver(_req:*Request,_res:*Response){throw "observer-secret";}
frame main(){local app:App=App.new();app.beforeRequest(requestId);app.beforeRequest(gate);app.afterRequest(accessLog);app.afterRequest(badObserver);app.router.post("/users/:token",okay);app.router.get("/failure",fail);app.useStatic("/static",${JSON.stringify(dir)});app.listenOn(${port},"127.0.0.1");}
`,
      );
      const exe = join(dir, "app");
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
      child = Bun.spawn([exe], { stdout: "pipe", stderr: "pipe" });
      let ready = false;
      for (let i = 0; i < 150; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/static/`)).ok) {
            ready = true;
            break;
          }
        } catch {}
        await Bun.sleep(20);
      }
      expect(ready).toBe(true);
      const response = await fetch(
        `http://127.0.0.1:${port}/users/path-secret?password=query-secret`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer header-secret",
            "X-Request-ID": "forged-request-id",
          },
          body: "body-secret",
        },
      );
      expect(await response.text()).toBe("127.0.0.1");
      const id = response.headers.get("x-request-id");
      expect(id).toMatch(/^\d+-\d+-\d+$/);
      expect(id).not.toBe("forged-request-id");
      const failure = await fetch(`http://127.0.0.1:${port}/failure`);
      expect(failure.status).toBe(500);
      await failure.text();
      const blocked = await fetch(`http://127.0.0.1:${port}/blocked`);
      expect(blocked.status).toBe(429);
      await blocked.text();
      child.kill();
      expect(await child.exited).toBe(0);
      const stdout = child.stdout;
      if (!stdout || typeof stdout === "number")
        throw new Error("Expected captured stdout");
      const logs = await new Response(stdout).text();
      for (const secret of [
        "path-secret",
        "query-secret",
        "header-secret",
        "body-secret",
        "exception-secret",
        "observer-secret",
        "forged-request-id",
      ])
        expect(logs).not.toContain(secret);
      const entries = logs
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));
      expect(entries.find((row) => row.request_id === id)).toMatchObject({
        method: "POST",
        route: "/users/:token",
        status: 200,
        io_failed: false,
        handler_failed: false,
      });
      expect(entries.find((row) => row.route === "/failure")).toMatchObject({
        status: 500,
        handler_failed: true,
      });
      expect(
        entries.some((row) => row.route === "[static]" && row.status === 200),
      ).toBe(true);
      expect(entries.some((row) => row.status === 429)).toBe(true);
      expect(new Set(entries.map((row) => row.request_id)).size).toBe(
        entries.length,
      );
      for (const row of entries) {
        expect(row.duration_ms).toBeGreaterThanOrEqual(0);
        expect(row.time_ms).toBeGreaterThan(0);
      }
    } finally {
      child?.kill("SIGKILL");
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

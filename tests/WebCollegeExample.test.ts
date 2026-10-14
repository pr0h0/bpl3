import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

const sqlitePath =
  spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], {
    encoding: "utf8",
    timeout: 10000,
  }).stdout?.trim() ?? "";
test.skipIf(process.platform !== "linux" || !sqlitePath.includes("/"))(
  "college web example supports validated CRUD, public assets, pagination and restart persistence",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-college-web-"));
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const address = probe.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    const port = address.port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      const exe = join(dir, "app");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          resolve("examples/college_web/main.bpl"),
          "-O",
          "3",
          "--clang-flag=-l:libsqlite3.so.0",
          "-o",
          exe,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      async function start() {
        child = Bun.spawn([exe], {
          cwd: resolve("examples/college_web"),
          env: {
            ...process.env,
            PORT: String(port),
            BPL_WEB_DB: join(dir, "app.sqlite"),
          },
          stdout: "ignore",
          stderr: "pipe",
        });
        for (let attempt = 0; attempt < 100; attempt++) {
          try {
            const response = await fetch(`http://127.0.0.1:${port}/api/health`);
            if (response.ok) return;
          } catch {
            /* Wait until the listener is ready. */
          }
          await Bun.sleep(20);
        }
        throw new Error("Example server did not start");
      }
      async function request(path: string, method = "GET", body?: unknown) {
        return await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers:
            body === undefined ? {} : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      }
      await start();
      expect(await (await request("/")).text()).toContain("Project board");
      expect((await request("/app.js")).headers.get("content-type")).toBe(
        "application/javascript",
      );
      let response = await request("/api/tasks", "POST", {
        title: '<λ & "quotes">',
        done: false,
      });
      expect(response.status).toBe(201);
      expect(response.headers.get("location")).toBe("/api/tasks/1");
      expect(await response.json()).toEqual({
        id: 1,
        title: '<λ & "quotes">',
        done: false,
      });
      response = await request("/api/tasks", "POST", {
        title: "",
        done: false,
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({ errors: { title: "required" } });
      expect((await request("/api/tasks", "POST")).status).toBe(415);
      expect((await request("/api/tasks?page=12oops")).status).toBe(422);
      response = await request("/api/tasks/1", "PUT", {
        title: "persisted",
        done: true,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: 1,
        title: "persisted",
        done: true,
      });
      response = await request("/api/tasks?limit=1&page=1");
      expect(await response.json()).toEqual({
        items: [{ id: 1, title: "persisted", done: true }],
        page: 1,
        limit: 1,
      });
      expect((await request("/api/tasks/999")).status).toBe(404);
      child!.kill();
      await child!.exited;
      child = undefined;
      await start();
      expect(await (await request("/api/tasks/1")).json()).toEqual({
        id: 1,
        title: "persisted",
        done: true,
      });
      response = await request("/api/tasks/1", "DELETE");
      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect((await request("/api/tasks/1")).status).toBe(404);
    } finally {
      child?.kill();
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

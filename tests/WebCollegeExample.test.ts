import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  statSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

const sqlitePath =
  spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], {
    encoding: "utf8",
    timeout: 10000,
  }).stdout?.trim() ?? "";
const sodiumPath =
  spawnSync("clang", ["-print-file-name=libsodium.so.23"], {
    encoding: "utf8",
    timeout: 10000,
  }).stdout?.trim() ?? "";
test.skipIf(
  process.platform !== "linux" ||
    !sqlitePath.includes("/") ||
    !sodiumPath.includes("/"),
)(
  "authenticated web app isolates users, revokes sessions and recovers from worker failure",
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
          "--clang-flag=-l:libsodium.so.23",
          "-o",
          exe,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);

      for (const tlsConfig of [
        { BPL_WEB_TLS_CERT: "missing.pem", BPL_WEB_TLS_KEY: "" },
        { BPL_WEB_TLS_CERT: "", BPL_WEB_TLS_KEY: "missing.pem" },
        {
          BPL_WEB_TLS_CERT: "missing.pem",
          BPL_WEB_TLS_KEY: "missing.pem",
          BPL_WEB_ORIGIN: "http://127.0.0.1:3000",
        },
      ]) {
        const invalid = spawnSync(exe, [], {
          cwd: resolve("examples/college_web"),
          env: {
            ...process.env,
            PORT: String(port),
            BPL_WEB_DB: join(dir, "app.sqlite"),
            ...tlsConfig,
          },
          encoding: "utf8",
          timeout: 10000,
        });
        expect(invalid.error).toBeUndefined();
        expect(invalid.status).not.toBeNull();
        expect(invalid.status).not.toBe(0);
        expect(invalid.status).toBe(1);
        expect(existsSync(join(dir, "app.sqlite"))).toBe(false);
      }
      async function start() {
        child = Bun.spawn([exe], {
          cwd: resolve("examples/college_web"),
          env: {
            ...process.env,
            PORT: String(port),
            BPL_WEB_DB: join(dir, "app.sqlite"),
            BPL_WEB_WORKERS: "2",
            BPL_WEB_TLS_CERT: "",
            BPL_WEB_TLS_KEY: "",
            BPL_WEB_ORIGIN: `http://127.0.0.1:${port}`,
          },
          stdout: "ignore",
          stderr: "pipe",
        });
        for (let attempt = 0; attempt < 250; attempt++) {
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
      type Session = { cookie: string; csrf: string };
      let current: Session | undefined;
      const origin = `http://127.0.0.1:${port}`;
      async function request(
        path: string,
        method = "GET",
        body?: unknown,
        session: Session | undefined = current,
        extra: Record<string, string> = {},
      ) {
        return await fetch(origin + path, {
          method,
          headers: {
            Connection: "close",
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(session ? { Cookie: session.cookie } : {}),
            ...(method !== "GET" && method !== "HEAD"
              ? {
                  Origin: origin,
                  ...(session ? { "X-CSRF-Token": session.csrf } : {}),
                }
              : {}),
            ...extra,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      }
      async function register(username: string) {
        const response = await request(
          "/auth/register",
          "POST",
          { username, password: "correct-test-password" },
          undefined,
        );
        expect(response.status).toBe(201);
        const header = response.headers.get("set-cookie")!;
        expect(header).toContain("HttpOnly");
        expect(header).toContain("SameSite=Strict");
        expect(header).toContain("Path=/");
        const reply = (await response.json()) as { csrf: string };
        return { cookie: header.split(";")[0]!, csrf: reply.csrf } as Session;
      }
      const legacy = spawnSync(
        "python3",
        [
          "-c",
          "import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); db.execute('CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT NOT NULL,done INTEGER NOT NULL)'); db.execute(\"INSERT INTO tasks VALUES (0,'legacy unowned task',0)\"); db.commit()",
          join(dir, "app.sqlite"),
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(legacy.status, legacy.stderr).toBe(0);
      await start();
      expect(statSync(join(dir, "app.sqlite")).mode & 0o777).toBe(0o600);
      const home = await request("/");
      expect(home.headers.get("x-frame-options")).toBe("DENY");
      expect(home.headers.get("content-security-policy")).toContain(
        "frame-ancestors 'none'",
      );
      expect(await home.text()).toContain("Project board");
      expect((await request("/app.js")).headers.get("content-type")).toBe(
        "application/javascript",
      );
      expect((await request("/api/tasks")).status).toBe(401);
      const alice = await register("alice");
      current = alice;
      expect((await request("/auth/me")).status).toBe(200);
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
      // Independent account cannot read or mutate Alice's task.
      const bob = await register("bob");
      expect(
        (await request("/api/tasks/1", "GET", undefined, bob)).status,
      ).toBe(404);
      expect(
        (
          await request(
            "/api/tasks/1",
            "PUT",
            { title: "changed", done: false },
            bob,
          )
        ).status,
      ).toBe(404);
      expect(
        (await request("/api/tasks/1", "DELETE", undefined, bob)).status,
      ).toBe(404);
      expect(
        await (await request("/api/tasks", "GET", undefined, bob)).json(),
      ).toEqual({ items: [], page: 1, limit: 20 });
      expect(
        (
          await request(
            "/api/tasks/1",
            "PUT",
            { title: "changed", done: false },
            alice,
            { "X-CSRF-Token": "wrong" },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request("/api/tasks/1", "DELETE", undefined, alice, {
            Origin: "https://other.example",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await request(
            "/auth/register",
            "POST",
            { username: "other", password: "correct-test-password" },
            undefined,
            { Origin: "https://other.example" },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await request("/api/tasks", "GET", undefined, {
            cookie: "bpl_session=" + "0".repeat(64),
            csrf: "",
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await request("/api/tasks", "GET", undefined, {
            cookie: alice.cookie + "; " + alice.cookie,
            csrf: alice.csrf,
          })
        ).status,
      ).toBe(401);
      const wrong = await request(
        "/auth/login",
        "POST",
        { username: "alice", password: "wrong-test-password" },
        undefined,
      );
      expect(wrong.status).toBe(401);
      // A partial request occupies one worker while a second worker stays available.
      const { createConnection } = await import("node:net");
      const slow = createConnection({ host: "127.0.0.1", port });
      await new Promise<void>((resolve, reject) => {
        slow.on("error", reject);
        slow.on("connect", () => {
          slow.write("GET /api/health HTTP/1.1\r\nHost: x\r\n");
          resolve();
        });
      });
      try {
        const before = performance.now();
        expect((await request("/api/health")).status).toBe(200);
        expect(performance.now() - before).toBeLessThan(1500);
      } finally {
        slow.destroy();
      }
      const parallel = await Promise.all(
        Array.from({ length: 8 }, () => request("/api/tasks/1")),
      );
      expect(parallel.every((r) => r.status === 200)).toBe(true);
      await Promise.all(parallel.map((r) => r.text()));
      const workersPath = `/proc/${child!.pid}/task/${child!.pid}/children`;
      const workerPids = readFileSync(workersPath, "utf8")
        .trim()
        .split(/\s+/)
        .map(Number);
      expect(workerPids.length).toBe(2);
      process.kill(workerPids[0]!, "SIGKILL");
      let restarted = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        await Bun.sleep(20);
        const ids = readFileSync(workersPath, "utf8")
          .trim()
          .split(/\s+/)
          .map(Number);
        if (ids.length === 2 && !ids.includes(workerPids[0]!)) {
          restarted = true;
          break;
        }
      }
      expect(restarted).toBe(true);
      expect((await request("/api/health")).status).toBe(200);
      const oversized = await request(
        "/api/tasks",
        "POST",
        { title: "valid", ignored: "x".repeat(5000) },
        alice,
      );
      expect(oversized.status).toBe(413);
      const deep = await fetch(origin + "/api/tasks", {
        method: "POST",
        headers: {
          Connection: "close",
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: alice.cookie,
          "X-CSRF-Token": alice.csrf,
        },
        body:
          '{"title":"ok","ignored":' +
          "[".repeat(80) +
          "0" +
          "]".repeat(80) +
          "}",
      });
      expect(deep.status).toBe(400);
      const fill = spawnSync(
        "python3",
        [
          "-c",
          "import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); u=db.execute(\"SELECT id FROM auth_users WHERE username='alice'\").fetchone()[0]; db.executemany('INSERT INTO tasks(title,done,owner_id) VALUES (?,0,?)',[('quota fixture',u)]*999); db.commit()",
          join(dir, "app.sqlite"),
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(fill.status, fill.stderr).toBe(0);
      expect(
        (await request("/api/tasks", "POST", { title: "over quota" }, alice))
          .status,
      ).toBe(409);
      const clear = spawnSync(
        "python3",
        [
          "-c",
          "import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); db.execute(\"DELETE FROM tasks WHERE title='quota fixture'\"); db.commit()",
          join(dir, "app.sqlite"),
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(clear.status, clear.stderr).toBe(0);
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
      const renewed = await request(
        "/auth/login",
        "POST",
        { username: "alice", password: "correct-test-password" },
        undefined,
      );
      expect(renewed.status).toBe(200);
      const renewBody = (await renewed.json()) as { csrf: string };
      const next: Session = {
        cookie: renewed.headers.get("set-cookie")!.split(";")[0]!,
        csrf: renewBody.csrf,
      };
      expect(next.cookie).not.toBe(alice.cookie);
      const expire = spawnSync(
        "python3",
        [
          "-c",
          "import sqlite3,sys,json; db=sqlite3.connect(sys.argv[1]); hashes=[r[0] for r in db.execute('SELECT password_hash FROM auth_users')]; orphan=db.execute('SELECT owner_id FROM tasks WHERE id=0').fetchone(); print(json.dumps({'argon2':all(h.startswith('$argon2id$') for h in hashes),'orphan_preserved':orphan==(None,)})); db.execute('UPDATE auth_sessions SET expires_at=0'); db.commit()",
          join(dir, "app.sqlite"),
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(expire.status, expire.stderr).toBe(0);
      expect(JSON.parse(expire.stdout)).toEqual({
        argon2: true,
        orphan_preserved: true,
      });
      expect((await request("/auth/me", "GET", undefined, next)).status).toBe(
        401,
      );
      const fresh = await request(
        "/auth/login",
        "POST",
        { username: "alice", password: "correct-test-password" },
        undefined,
      );
      expect(fresh.status).toBe(200);
      const freshBody = (await fresh.json()) as { csrf: string };
      next.cookie = fresh.headers.get("set-cookie")!.split(";")[0]!;
      next.csrf = freshBody.csrf;
      expect((await request("/auth/me", "GET", undefined, alice)).status).toBe(
        401,
      );
      expect((await request("/auth/logout", "POST", {}, next)).status).toBe(
        204,
      );
      expect((await request("/auth/me", "GET", undefined, next)).status).toBe(
        401,
      );
      // Invalid credentials are throttled; unknown users return the same generic error.
      for (let attempt = 0; attempt < 11; attempt++) {
        const bad = await request(
          "/auth/login",
          "POST",
          { username: "unknown", password: "wrong-test-password" },
          undefined,
        );
        expect(bad.status).toBe(attempt < 10 ? 401 : 429);
        await bad.text();
      }
    } catch (error) {
      child?.kill();
      if (child) {
        await child.exited;
        const stream = child.stderr;
        const log =
          stream instanceof ReadableStream
            ? await new Response(stream).text()
            : "";
        throw new Error(String(error) + "\n" + log);
      }
      throw error;
    } finally {
      child?.kill();
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

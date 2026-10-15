import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const enabled = process.env.BPL_TEST_COMPILER_DOCKER === "1";
test.skipIf(!enabled)(
  "compiler image compiles read-only mounted sources, runs in Docker and exports host-owned binaries",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-compiler-container-"));
    const image = process.env.BPL_COMPILER_IMAGE || "bpl-compiler:local";
    const uid = process.getuid?.() ?? 10001;
    const gid = process.getgid?.() ?? 10001;
    const run = (args: string[], cwd?: string) => {
      const result = spawnSync(args[0]!, args.slice(1), {
        cwd,
        encoding: "utf8",
        timeout: 60000,
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return result.stdout;
    };
    try {
      mkdirSync(join(dir, "source"));
      mkdirSync(join(dir, "output"));
      writeFileSync(
        join(dir, "source", "main.bpl"),
        String.raw`import [String] from "std/string.bpl";
extern printf(fmt:string,...)ret int;
frame main()ret int{local value:String=String.new("container compiler works");printf("%s\n",value.data);value.destroy();return 0;}`,
      );
      const common = [
        "docker",
        "run",
        "--rm",
        "--user",
        `${uid}:${gid}`,
        "-v",
        `${join(dir, "source")}:/work:ro`,
        "-v",
        `${join(dir, "output")}:/out`,
        "-w",
        "/work",
      ];
      expect(run([...common, image, "--version"]).trim()).toMatch(
        /^0\.1\.[0-9]+$/,
      );
      run([...common, image, "build", "main.bpl", "-O", "3", "-o", "/out/app"]);
      expect(statSync(join(dir, "output", "app")).uid).toBe(uid);
      run([
        ...common,
        image,
        "build",
        "main.bpl",
        "-O",
        "3",
        "--clang-flag=-fsanitize=address",
        "-o",
        "/out/asan",
      ]);
      expect(
        run([
          ...common,
          "--env",
          "ASAN_OPTIONS=detect_leaks=1:halt_on_error=1",
          "--entrypoint",
          "/out/asan",
          image,
        ]),
      ).toBe("container compiler works\n");
      expect(run([...common, "--entrypoint", "/out/app", image])).toBe(
        "container compiler works\n",
      );
      if (process.platform === "linux")
        expect(run([join(dir, "output", "app")])).toBe(
          "container compiler works\n",
        );
      // Included archives and versioned native libraries must work in a fresh project.
      writeFileSync(
        join(dir, "output", "bpl.json"),
        JSON.stringify({
          name: "image-consumer",
          version: "0.1.0",
          main: "db.bpl",
        }),
      );
      run([
        ...common,
        "-w",
        "/out",
        image,
        "install",
        "/opt/bpl/packages/bpl-sqlite/bpl-sqlite-0.1.0.tgz",
      ]);
      writeFileSync(
        join(dir, "output", "db.bpl"),
        `import [SQLite],[Statement] from "bpl-sqlite";frame main()ret int{local db:SQLite=SQLite.open(":memory:");local q:Statement=db.prepare("SELECT 42");if(!q.step()||q.integer(0)!=42){return 1;}q.close();db.close();return 0;}`,
      );
      run([
        ...common,
        "-w",
        "/out",
        image,
        "build",
        "db.bpl",
        "--clang-flag=-l:libsqlite3.so.0",
        "-o",
        "/out/db",
      ]);
      run([...common, "--entrypoint", "/out/db", image]);
      run([
        ...common,
        "-w",
        "/out",
        image,
        "install",
        "/opt/bpl/packages/bpl-auth/bpl-auth-0.1.0.tgz",
      ]);
      writeFileSync(
        join(dir, "output", "auth.bpl"),
        `import [Auth] from "bpl-auth";import [SQLite] from "bpl-sqlite";frame main()ret int{local db:SQLite=SQLite.open(":memory:");local auth:Auth=Auth.new(&db,"http://localhost",false);auth.destroy();db.close();return 0;}`,
      );
      run([
        ...common,
        "-w",
        "/out",
        image,
        "build",
        "auth.bpl",
        "--clang-flag=-l:libsqlite3.so.0",
        "--clang-flag=-l:libsodium.so.23",
        "-o",
        "/out/auth",
      ]);
      run([...common, "--entrypoint", "/out/auth", image]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  180000,
);

test.skipIf(!enabled)(
  "playground image serves its UI and executes jobs in isolated worker containers",
  async () => {
    const image =
      process.env.BPL_CONTAINER_PLAYGROUND_IMAGE || "bpl-playground:local";
    const socket = process.env.BPL_DOCKER_SOCKET || "/var/run/docker.sock";
    const name = `bpl-container-ui-${randomUUID()}`;
    const docker = (...args: string[]) => {
      const result = spawnSync("docker", args, {
        encoding: "utf8",
        timeout: 20000,
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return result.stdout.trim();
    };
    try {
      docker(
        "run",
        "--detach",
        "--rm",
        "--name",
        name,
        "--publish",
        "127.0.0.1::3001",
        "--group-add",
        String(statSync(socket).gid),
        "--volume",
        `${socket}:/var/run/docker.sock`,
        "--env",
        `BPL_PLAYGROUND_IMAGE=${image}`,
        image,
      );
      const published = docker("port", name, "3001/tcp");
      const address = /^127\.0\.0\.1:(\d+)$/.exec(published);
      expect(address).not.toBeNull();
      const origin = `http://127.0.0.1:${address![1]}`;
      let ready = false;
      for (let i = 0; i < 150; i++) {
        try {
          const response = await fetch(`${origin}/health`);
          if (response.ok) {
            const health = (await response.json()) as { runner?: unknown };
            expect(health.runner).toBe("docker");
            ready = true;
            break;
          }
        } catch {}
        await Bun.sleep(100);
      }
      expect(ready, docker("logs", name)).toBe(true);
      const home = await fetch(origin);
      expect(home.status).toBe(200);
      expect(await home.text()).toContain("<html");
      const request = await fetch(`${origin}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: 'extern printf(fmt:string,...)ret int;frame main()ret int{printf("image playground works\\n");return 0;}',
        }),
      });
      const result = (await request.json()) as {
        success?: unknown;
        output?: unknown;
      };
      expect(result.success, JSON.stringify(result)).toBe(true);
      expect(result.output).toBe("image playground works\n");
    } finally {
      spawnSync("docker", ["rm", "--force", name], {
        encoding: "utf8",
        timeout: 20000,
      });
    }
  },
  90000,
);

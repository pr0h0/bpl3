import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function native(source: string) {
  // Keep the source in the repository so workspace package resolution is exercised.
  const dir = mkdtempSync(resolve(".web-package-test-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const exe = join(tmpdir(), `bpl-web-${process.pid}-${dir.split("-").at(-1)}`);
    try {
      const build = spawnSync("bun", [resolve("index.ts"), "build", file, "-o", exe], { encoding: "utf8", timeout: 60000 });
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const run = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
      expect(run.status, run.stdout + run.stderr).toBe(0);
    } finally { rmSync(exe, { force: true }); }
  } finally { rmSync(dir, { force: true, recursive: true }); }
}

test("HTTP parser bounds framing, normalizes headers, decodes query segments and owns memory", () => {
  native(`
    import [HttpParser], [ParsedRequest] from "bpl-http-parser";
    import [Option] from "std/option.bpl";
    import [Map] from "std/map.bpl";
    extern strcmp(a:string,b:string) ret int;
    frame main() ret int {
      local p: ParsedRequest = HttpParser.parse("POST /users?flag&name=a%26b+z&x=1&x=2 HTTP/1.1\\r\\nHost: localhost\\r\\ncOnTeNt-LeNgTh: 3\\r\\n\\r\\nabc");
      if (!p.valid || p.body_length != 3 || strcmp(p.body, "abc") != 0 || strcmp(p.path, "/users") != 0) { return 1; }
      if (strcmp(p.query.get("flag").unwrap(), "") != 0 || strcmp(p.query.get("name").unwrap(), "a&b z") != 0 || strcmp(p.query.get("x").unwrap(), "2") != 0) { return 2; }
      if (strcmp(p.headers.get("host").unwrap(), "localhost") != 0) { return 3; }
      p.destroy(); p.destroy();
      p = HttpParser.parse("POST / HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: 5\\r\\n\\r\\nabc");
      if (p.valid || p.error_code != 0) { return 4; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nBad\\r\\nHost: x\\r\\n\\r\\n");
      if (p.valid || p.error_code != 400) { return 5; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: 1\\r\\nContent-Length: 2\\r\\n\\r\\naa");
      if (p.valid || p.error_code != 400) { return 6; } p.destroy();
      p = HttpParser.parse("GET /?x=%00 HTTP/1.1\\r\\nHost: x\\r\\n\\r\\n");
      if (p.valid || p.error_code != 400) { return 7; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nHost: x\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n0\\r\\n\\r\\n");
      if (p.valid || p.error_code != 501) { return 8; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: 999999999999999999\\r\\n\\r\\n");
      if (p.valid || p.error_code != 413) { return 9; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\n\\r\\n");
      if (p.valid || p.error_code != 400) { return 10; } p.destroy();
      return 0;
    }
  `);
}, 90000);

test("Express serves fragmented requests, short-circuits middleware and emits complete binary-safe responses", async () => {
  const { createServer, createConnection } = await import("node:net");
  const dir = mkdtempSync(resolve(".web-package-test-"));
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const exe = join(dir, "server");
  let processHandle: ReturnType<typeof Bun.spawn> | undefined;
  try {
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "data.bin"), Buffer.from([65, 0, 255, 66]));
    writeFileSync(join(dir, "private.txt"), "private");
    symlinkSync(join(dir, "private.txt"), join(dir, "assets", "escape.txt"));
    writeFileSync(join(dir, "main.bpl"), `
      import [App], [Request], [Response], [Router] from "bpl-express";
      import [Map] from "std/map.bpl";
      import [Option] from "std/option.bpl";
      extern strcmp(a:string,b:string) ret int;
      frame gate(req:*Request,res:*Response) { if(strcmp(req.path,"/blocked")==0){res.status(403).send("blocked");} }
      frame blocked(_req:*Request,res:*Response) { res.send("WRONG"); }
      frame echo(req:*Request,res:*Response) {res.setHeader("X-Custom","works");res.sendBytes(req.body,req.body_length);}
      frame hello(_req:*Request,res:*Response) {res.text("hello");}
      frame stream(_req:*Request,res:*Response) {res.write("a");res.write("b");res.end();}
      frame fail(_req:*Request,_res:*Response) {throw "private error";}
      frame badHeader(_req:*Request,res:*Response) {res.setHeader("X-Foo","a\\r\\nb: c");}
      frame params(req:*Request,res:*Response) {res.send(req.getParam("id").unwrap());}
      frame main() {
        local app:App=App.new(); app.use(gate); app.useStatic("/assets", "${dir}/assets");
        app.router.get("/blocked",blocked);app.router.post("/echo",echo);
        app.router.get("/hello",hello);app.router.get("/stream",stream);
        app.router.get("/fail",fail);app.router.get("/bad-header",badHeader);
        app.router.patch("/users/:id/*",params);
        app.listen(${port});
      }
    `);
    const build = spawnSync("bun", [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe], { encoding: "utf8", timeout: 60000 });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    processHandle = Bun.spawn([exe], { stdout: "ignore", stderr: "pipe" });
    async function request(parts: (string | Buffer)[]) {
      return await new Promise<Buffer>((resolve, reject) => {
        const socket = createConnection({ port, host: "127.0.0.1" });
        const chunks: Buffer[] = [];
        socket.setTimeout(5000, () => socket.destroy(new Error("Request timeout")));
        socket.on("error", reject); socket.on("data", (data) => chunks.push(data));
        socket.on("end", () => resolve(Buffer.concat(chunks)));
        socket.on("connect", async () => {
          for (const part of parts) { socket.write(part); await Bun.sleep(10); }
        });
      });
    }
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { await request(["GET /hello HTTP/1.1\r\nHost: x\r\n\r\n"]); ready = true; break; }
      catch { await Bun.sleep(20); }
    }
    expect(ready).toBe(true);
    const binary = Buffer.from([65, 0, 255, 66]);
    const echo = await request(["POST /echo HTTP/1.1\r\nHo", "st: x\r\nContent-Length: 4\r\n\r\n", binary.subarray(0, 2), binary.subarray(2)]);
    expect(echo.toString("latin1")).toContain("X-Custom: works\r\n");
    expect(echo.subarray(echo.indexOf("\r\n\r\n") + 4)).toEqual(binary);
    const staticResponse = await request(["GET /assets/data.bin HTTP/1.1\r\nHost: x\r\n\r\n"]);
    expect(staticResponse.subarray(staticResponse.indexOf("\r\n\r\n") + 4)).toEqual(binary);
    for (const path of ["/assets/../private.txt", "/assets/%2e%2e/private.txt", "/assets/escape.txt"]) {
      const response = (await request([`GET ${path} HTTP/1.1\r\nHost: x\r\n\r\n`])).toString();
      expect(response).toContain("403"); expect(response).not.toEndWith("private");
    }
    const blocked = (await request(["GET /blocked HTTP/1.1\r\nHost: x\r\n\r\n"])).toString();
    expect(blocked).toContain("403"); expect(blocked).toEndWith("blocked"); expect(blocked).not.toContain("WRONG");
    const head = (await request(["HEAD /hello HTTP/1.1\r\nHost: x\r\n\r\n"])).toString();
    expect(head).toContain("Content-Length: 5\r\n"); expect(head).toEndWith("\r\n\r\n");
    expect((await request(["GET /stream HTTP/1.1\r\nHost: x\r\n\r\n"])).toString()).toEndWith("1\r\na\r\n1\r\nb\r\n0\r\n\r\n");
    expect((await request(["PATCH /users/42/logs HTTP/1.1\r\nHost: x\r\n\r\n"])).toString()).toEndWith("42");
    for (const path of ["/fail", "/bad-header"]) {
      const response = (await request([`GET ${path} HTTP/1.1\r\nHost: x\r\n\r\n`])).toString();
      expect(response).toContain("500"); expect(response).not.toContain("private error");
    }
    expect((await request(["BREW /hello HTTP/1.1\r\nHost: x\r\n\r\n"])).toString()).toContain("405");
  } finally {
    processHandle?.kill(); if (processHandle) await processHandle.exited;
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

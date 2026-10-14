import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function native(source: string, flags: string[] = []) {
  // Keep the source in the repository so workspace package resolution is exercised.
  const dir = mkdtempSync(resolve(".web-package-test-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const exe = join(tmpdir(), `bpl-web-${process.pid}-${dir.split("-").at(-1)}`);
    try {
      const build = spawnSync("bun", [resolve("index.ts"), "build", file, "-o", exe, ...flags], { encoding: "utf8", timeout: 60000 });
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
      frame echo(req:*Request,res:*Response) {res.setHeader("X-Custom","works");res.setHeader("X-Long","xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");res.sendBytes(req.body,req.body_length);}
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

test("database validates types, owns strings, compares ordering and round-trips escaped values", () => {
  native(`
    import [Database], [Table], [Row], [Value], [DataType], [Engine], [Condition], [Operator] from "bpl-db";
    import [Array] from "std/array.bpl";
    extern strcmp(a:string,b:string) ret int;
    extern unlink(path:string) ret int;
    extern getpid() ret int; extern sprintf(buf:string,fmt:string,...) ret int;
    frame main() ret int {
      local db:Database=Database.new(); local t:*Table=db.create_table("items");
      t.add_column("title",DataType.Str); local values:Array<Value>=Array<Value>.new(4);
      local mutable:char[8]=['a','b','c','\\0','\\0','\\0','\\0','\\0'];
      values.push(Value.Str(cast<string>(&mutable[0])));
      if(t.insert(&values)!=1 || db.create_table("items") != t){return 1;}
      mutable[0]='z';
      local row: *Row = t.rows.getRef(0);
      local engine:Engine=Engine.new(); local conditions:Array<Condition>=Array<Condition>.new(4);
      local condition:Condition; condition.column="title"; condition.op=Operator.Lt; condition.value=Value.Str("zzz"); conditions.push(condition);
      if(!engine.check_row(row,t,&conditions)){return 2;}
      condition.value=Value.Int(1);condition.op=Operator.Lte;conditions.set(0,condition);
      if(engine.check_row(row,t,&conditions)){return 3;}
      values.set(0,Value.Int(3));if(t.insert(&values)!=-1){return 4;}
      values.set(0,Value.Str("space newline\\nquotes\\\" & λ"));if(t.insert(&values)!=2){return 5;}
      local path:char[128];
      sprintf(cast<string>(&path[0]),"/tmp/bpl-db-web-%d.txt",getpid());
      db.save(cast<string>(&path[0]));
      local loaded:Database=Database.new();loaded.load(cast<string>(&path[0]));
      local table:*Table=loaded.get_table("items");if(table==nullptr || table.rows.len()!=2){return 6;}
      local v:Value=table.rows.getRef(1).values.get(0);
      match(v){Value.Str(s)=>{if(strcmp(s,"space newline\\nquotes\\\" & λ")!=0){return 7;}},_=>{return 8;},};
      loaded.destroy();db.destroy();engine.destroy();conditions.destroy();values.destroy();unlink(cast<string>(&path[0]));return 0;
    }
  `);
}, 90000);

test("HTTP client validates URLs and parses bounded binary/chunked responses", () => {
  native(`
    import [Url], [HttpResponse], [RequestBuilder] from "bpl-http-client";
    import [HttpHeaders] from "bpl-http-client";
    import [Option] from "std/option.bpl";
    extern strlen(text:string) ret long; extern strcmp(a:string,b:string) ret int;
    frame main() ret int {
      local url:Url=Url.parse("http://localhost:8080?x=1#frag");
      if(!url.valid||url.port!=8080||strcmp(url.host,"localhost")!=0||strcmp(url.path,"/?x=1")!=0){return 1;}url.destroy();
      url=Url.parse("https://localhost/");if(url.valid){return 2;}url.destroy();
      url=Url.parse("http://localhost:999999/");if(url.valid){return 3;}url.destroy();
      local raw:string="HTTP/1.1 200 OK\\r\\ntransfer-encoding: chunked\\r\\nX-Answer: yes\\r\\n\\r\\n2;foo=bar\\r\\nab\\r\\n1\\r\\nc\\r\\n0\\r\\nX-Trailer: done\\r\\n\\r\\n";
      local r:*HttpResponse=HttpResponse.parseBytes(raw,strlen(raw),false);
      if(r.status!=200||r.body_length!=3||strcmp(r.body,"abc")!=0||strcmp(r.headers.get("x-answer").unwrap(),"yes")!=0){return 4;}r.destroy();
      raw="HTTP/1.1 200 OK\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\nFFFFFFF\\r\\nx\\r\\n";
      r=HttpResponse.parseBytes(raw,strlen(raw),false);if(r.status!=0){return 5;}r.destroy();
      raw="HTTP/1.1 200 OK\\r\\nContent-Length: 5\\r\\n\\r\\nabc";
      r=HttpResponse.parseBytes(raw,strlen(raw),false);if(r.status!=0){return 6;}r.destroy();
      r=HttpResponse.parseBytes(raw,strlen(raw),true);if(r.status!=200||r.body_length!=0){return 7;}r.destroy();
      local builder:RequestBuilder=RequestBuilder.new("http://localhost/");
      builder.header("X-Example","one");builder.header("x-example","two");
      if(strcmp(builder.headers.get("X-EXAMPLE").unwrap(),"two")!=0){return 8;}
      local caught:bool=false;try{builder.header("X-Test","a\\r\\nb: c");}catch{caught=true;}
      if(!caught){return 9;}builder.destroy();return 0;
    }
  `);
}, 90000);

test("HTTP client sends custom headers and reads a fragmented binary response over a real socket", async () => {
  const { createServer } = await import("node:net");
  let received = "";
  const server = createServer((socket) => {
    socket.on("data", async (data) => {
      received += data.toString();
      if (!received.includes("\r\n\r\n")) return;
      socket.write("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nX-Result: yes\r\n\r\n");
      socket.write(Buffer.from([65, 0])); await Bun.sleep(20); socket.end(Buffer.from([255, 66]));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const dir = mkdtempSync(resolve(".web-package-test-"));
  try {
    writeFileSync(join(dir, "main.bpl"), `
      import [RequestBuilder],[HttpResponse] from "bpl-http-client";
      import [HttpHeaders] from "bpl-http-client";import [Option] from "std/option.bpl";
      extern strcmp(a:string,b:string) ret int;
      frame main() ret int {
        local request:RequestBuilder=RequestBuilder.new("http://127.0.0.1:${address.port}/test");
        request.header("X-Example","sent");request.header("X-Long","xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");local response:*HttpResponse=request.send();
        if(response.status!=200||response.body_length!=4||response.body[0]!=65||response.body[1]!=0||cast<u8>(response.body[2])!=255||response.body[3]!=66){return 1;}
        if(strcmp(response.headers.get("X-RESULT").unwrap(),"yes")!=0){return 2;}
        response.destroy();request.destroy();return 0;
      }
    `);
    const exe = join(dir, "client");
    const build = spawnSync("bun", [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe], { encoding: "utf8", timeout: 60000 });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const child = Bun.spawn([exe], { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => child.kill(), 10000);
    try { expect(await child.exited, await new Response(child.stderr).text()).toBe(0); }
    finally { clearTimeout(timer); }
    expect(received).toContain("x-example: sent\r\n");
    expect(received).toContain(`Host: 127.0.0.1:${address.port}\r\n`);
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}, 90000);

test("template compiler emits valid zero-argument components and escaped UTF-8 HTML", () => {
  const dir = mkdtempSync(resolve(".web-package-test-"));
  try {
    mkdirSync(join(dir, "views")); mkdirSync(join(dir, "output"));
    writeFileSync(join(dir, "views", "empty.bte"), "<h1>Hello</h1>\n");
    writeFileSync(join(dir, "views", "greeting.bte"), '@args name: string\n<p>{{ name }}</p>\n');
    const tool = join(dir, "templ");
    const build = spawnSync("bun", [resolve("index.ts"), "build", resolve("packages/bpl-templ/src/cli.bpl"), "-o", tool], { encoding: "utf8", timeout: 60000 });
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const generation = spawnSync(tool, ["generate", join(dir, "views"), "-o", join(dir, "output")], { encoding: "utf8", timeout: 10000 });
    expect(generation.status, generation.stdout + generation.stderr).toBe(0);
    expect(generation.stdout).not.toContain("DEBUG");
    native(`
      import [Empty] from "${dir}/output/empty.bpl";
      import [Greeting] from "${dir}/output/greeting.bpl";
      import [StringBuilder] from "std/string_builder.bpl";
      extern strstr(a:string,b:string) ret string;
      frame main() ret int {
        local html:string=Empty.render();if(strstr(html,"<h1>Hello</h1>")==nullptr){return 1;}Empty.free(html);
        local sb:StringBuilder=StringBuilder.new(8);Greeting.write(&sb,"<λ&\\\"'>");
        if(strstr(sb.toString(),"&lt;λ&amp;&quot;&#39;&gt;")==nullptr){return 2;}sb.destroy();return 0;
      }
    `);
    writeFileSync(join(dir, "views", "broken.bte"), '<p>{{ missing\n');
    const malformed = spawnSync(tool, ["generate", join(dir, "views"), "-o", join(dir, "output")], { encoding: "utf8", timeout: 10000 });
    expect(malformed.status).not.toBe(0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}, 90000);

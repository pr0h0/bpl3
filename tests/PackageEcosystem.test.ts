import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeRepoTempDir } from "./helpers/repoTempDir";

// Packages whose README examples must type-check. Each complete example (one
// with `frame main`) is checked against the workspace packages.
const README_PACKAGES = [
  "bpl-cache",
  "bpl-csv",
  "bpl-express",
  "bpl-json",
  "bpl-json-schema",
  "bpl-jwt",
  "bpl-log",
  "bpl-markdown",
  "bpl-metrics",
  "bpl-validation",
  "bpl-web-middleware",
  "bpl-websocket",
];

test("package README examples type-check", () => {
  const dir = makeRepoTempDir("package-readmes-");
  try {
    const files: string[] = [];
    for (const name of README_PACKAGES) {
      const text = readFileSync(resolve("packages", name, "README.md"), "utf8");
      const blocks = [...text.matchAll(/```bpl\n([\s\S]*?)```/g)]
        .map((match) => match[1] ?? "")
        .filter((block) => block.includes("frame main"));
      expect(blocks.length, `${name} has a runnable example`).toBeGreaterThan(
        0,
      );
      blocks.forEach((block, index) => {
        const file = join(dir, `${name}-${index}.bpl`);
        writeFileSync(file, block);
        files.push(file);
      });
    }
    for (const file of files) {
      const check = spawnSync("bun", [resolve("index.ts"), "check", file], {
        encoding: "utf8",
        timeout: 60000,
      });
      expect(check.status, `${file}\n${check.stdout}${check.stderr}`).toBe(0);
    }
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}, 180000);

test("new package archives install with their dependencies and run outside the checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-ecosystem-install-"));
  try {
    writeFileSync(
      join(dir, "bpl.json"),
      JSON.stringify({ name: "ecosystem", version: "0.1.0", main: "main.bpl" }),
    );
    for (const name of [
      "bpl-json-schema",
      "bpl-jwt",
      "bpl-cache",
      "bpl-metrics",
      "bpl-markdown",
      "bpl-log",
      "bpl-websocket",
    ]) {
      const install = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "install",
          resolve(`packages/${name}/${name}-0.1.0.tgz`),
        ],
        { cwd: dir, encoding: "utf8", timeout: 60000 },
      );
      expect(install.status, install.stdout + install.stderr).toBe(0);
    }
    writeFileSync(
      join(dir, "main.bpl"),
      String.raw`
import [JsonSchema], [SchemaResult] from "bpl-json-schema";
import [Json], [JsonValue] from "bpl-json";
import [Jwt], [JwtResult], [JwtOptions] from "bpl-jwt";
import [Cache] from "bpl-cache";
import [Registry], [MetricFamily] from "bpl-metrics";
import [Markdown] from "bpl-markdown";
import [Logger], [LogLevel] from "bpl-log";
import [WebSocket] from "bpl-websocket";
import [App], [Request] from "bpl-express";
import [String] from "std/string.bpl";
extern strcmp(a: string, b: string) ret int;
extern strstr(a: string, b: string) ret string;
frame main() ret int {
    local schema: JsonSchema = JsonSchema.compile("{\"type\":\"object\",\"required\":[\"sub\"]}");
    local verdict: SchemaResult = schema.validateText("{\"sub\":\"u1\",\"exp\":4000000000}");
    if (!schema.valid() || !verdict.ok()) { return 1; }
    verdict.destroy();
    schema.destroy();
    local claims: *JsonValue = Json.parse("{\"sub\":\"u1\",\"exp\":4000000000}");
    local token: String = Jwt.sign(claims, "0123456789abcdef0123456789abcdef");
    claims.destroy();
    local checked: JwtResult = Jwt.verify(token.data, "0123456789abcdef0123456789abcdef");
    if (!checked.ok || strcmp(checked.claims.getString("sub", ""), "u1") != 0) { return 2; }
    checked.destroy();
    token.destroy();
    local cache: Cache = Cache.new(2, 100);
    cache.set("k", "v");
    if (strcmp(cache.get("k").unwrap(), "v") != 0) { return 3; }
    cache.destroy();
    local registry: Registry = Registry.new();
    local hits: *MetricFamily = registry.counter("hits_total", "Hits.", "");
    hits.inc();
    local metrics: String = registry.render();
    if (strstr(metrics.data, "hits_total 1") == nullptr) { return 4; }
    metrics.destroy();
    registry.destroy();
    local html: String = Markdown.toHtml("**hi**");
    if (strcmp(html.data, "<p><strong>hi</strong></p>\n") != 0) { return 5; }
    html.destroy();
    local log: Logger = Logger.new();
    log.setLevel(LogLevel.Error);
    log.info("dropped");
    log.destroy();
    local app: App = App.new();
    local req: Request = app.parseRequest("GET / HTTP/1.1\r\nHost: x\r\n\r\n");
    if (WebSocket.isUpgrade(&req)) { return 6; }
    req.destroy();
    app.destroy();
    return 0;
}`,
    );
    const exe = join(dir, "app");
    const build = spawnSync(
      "bun",
      [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe],
      { cwd: dir, encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(exe, [], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}, 180000);

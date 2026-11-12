import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeRepoTempDir } from "./helpers/repoTempDir";

function run(source: string): { stdout: string; stderr: string } {
  const dir = makeRepoTempDir("log-test-");
  const outDir = mkdtempSync(join(tmpdir(), "bpl-log-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const exe = join(outDir, "main");
    const build = spawnSync(
      "bun",
      [resolve("index.ts"), "build", file, "-o", exe],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const result = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    return { stdout: result.stdout, stderr: result.stderr };
  } finally {
    rmSync(dir, { force: true, recursive: true });
    rmSync(outDir, { force: true, recursive: true });
  }
}

test("bpl-log writes JSON lines with context, typed fields, levels and redaction", () => {
  const { stdout, stderr } = run(String.raw`
import [Logger], [LogEvent], [LogLevel] from "bpl-log";
import [JsonValue] from "bpl-json";
frame clock() ret long { return 1700000000123; }
frame main() ret int {
    local log: Logger = Logger.new();
    log.setClock(clock);
    log.with("service", "api").withInt("pid", 7).withBool("canary", true);
    log.info("started");
    log.debug("dropped below the default info level");
    local event: LogEvent = log.event(LogLevel.Warn, "slow \"query\"\n");
    local tags: *JsonValue = JsonValue.newArray();
    tags.push(JsonValue.newString("db"));
    event.int("ms", 1500).num("ratio", 0.25).bool("cached", false).str("Password", "hunter2").str("missing", nullptr).json("tags", tags).str("service", "override").send();
    tags.destroy();
    log.redact("ssn");
    local request: Logger = log.child();
    request.with("request_id", "r-1");
    local second: LogEvent = request.event(LogLevel.Error, "failed");
    second.err("disk full").str("ssn", "123").send();
    request.destroy();
    log.info("parent context unchanged");
    log.setLevel(LogLevel.Debug);
    log.debug("now visible");
    log.setLevel(LogLevel.Off);
    log.error("silenced");
    local skipped: LogEvent = log.event(LogLevel.Error, "never");
    skipped.str("k", "v").send();
    log.setLevel(LogLevel.Info);
    log.setOutput(1);
    log.info("to stdout");
    log.destroy();
    return 0;
}`);
  const lines = stderr.trimEnd().split("\n");
  const parsed = lines.map((line) => JSON.parse(line));
  expect(parsed).toEqual([
    {
      time: "2023-11-14T22:13:20.123Z",
      level: "info",
      msg: "started",
      service: "api",
      pid: 7,
      canary: true,
    },
    {
      time: "2023-11-14T22:13:20.123Z",
      level: "warn",
      msg: 'slow "query"\n',
      service: "override",
      pid: 7,
      canary: true,
      ms: 1500,
      ratio: 0.25,
      cached: false,
      Password: "[REDACTED]",
      missing: null,
      tags: ["db"],
    },
    {
      time: "2023-11-14T22:13:20.123Z",
      level: "error",
      msg: "failed",
      service: "api",
      pid: 7,
      canary: true,
      request_id: "r-1",
      error: "disk full",
      ssn: "[REDACTED]",
    },
    {
      time: "2023-11-14T22:13:20.123Z",
      level: "info",
      msg: "parent context unchanged",
      service: "api",
      pid: 7,
      canary: true,
    },
    {
      time: "2023-11-14T22:13:20.123Z",
      level: "debug",
      msg: "now visible",
      service: "api",
      pid: 7,
      canary: true,
    },
  ]);
  expect(stdout).toBe(
    '{"time":"2023-11-14T22:13:20.123Z","level":"info","msg":"to stdout","service":"api","pid":7,"canary":true}\n',
  );
}, 90000);

test("bpl-log logfmt output, sinks and reserved keys", () => {
  const { stdout } = run(String.raw`
import [Logger], [LogEvent], [LogFormat], [LogLevel] from "bpl-log";
import [StringBuilder] from "std/string_builder.bpl";
extern printf(fmt: string, ...) ret int;
global CAPTURED: StringBuilder;
global LINES: int = 0;
frame capture(line: string, size: long) {
    CAPTURED.append(line);
    LINES = LINES + 1;
    if (size != (strlen(line))) { LINES = 100; }
}
extern strlen(text: string) ret long;
frame clock() ret long { return 86399999; }
frame main() ret int {
    CAPTURED = StringBuilder.new(64);
    local log: Logger = Logger.new();
    log.setClock(clock);
    log.setFormat(LogFormat.Logfmt);
    log.setSink(capture);
    local event: LogEvent = log.event(LogLevel.Info, "user login");
    event.str("user", "ada").str("note", "a=b \"c\"").int("n", -3).str("bad key!", "x").str("empty", "").str("time", "spoofed").str("token", "abc").send();
    log.setFormat(LogFormat.Json);
    local second: LogEvent = log.event(LogLevel.Info, "json");
    second.str("level", "spoofed").str("msg", "spoofed").send();
    printf("%d\n%s", LINES, CAPTURED.toString());
    CAPTURED.destroy();
    log.destroy();
    return 0;
}`);
  expect(stdout).toBe(
    [
      "2",
      'time=1970-01-01T23:59:59.999Z level=info msg="user login" user=ada note="a=b \\"c\\"" n=-3 bad_key_=x empty="" token=[REDACTED]',
      '{"time":"1970-01-01T23:59:59.999Z","level":"info","msg":"json"}',
      "",
    ].join("\n"),
  );
}, 90000);

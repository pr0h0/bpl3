// Local native HTTP/HTTPS + SQLite benchmark. Creates and removes disposable services.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const requests = Number(process.env.BPL_BENCH_REQUESTS ?? 200);
if (!Number.isInteger(requests) || requests < 20 || requests > 20000)
  throw new Error("BPL_BENCH_REQUESTS must be 20–20000");
if (process.platform !== "linux")
  throw new Error("Native web benchmark requires Linux");
const dir = mkdtempSync(join(tmpdir(), "bpl-web-benchmark-"));
const rows: Record<string, unknown>[] = [];
let child: ReturnType<typeof Bun.spawn> | undefined;
function command(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.status !== 0)
    throw new Error(`${command}: ${result.stdout}${result.stderr}`);
  return result.stdout;
}
function memory(pid: number) {
  let pss = 0,
    rss = 0;
  const children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  for (const item of [pid, ...children]) {
    const data = readFileSync(`/proc/${item}/smaps_rollup`, "utf8");
    pss += Number(/^Pss:\s+(\d+)/m.exec(data)?.[1] ?? 0);
    rss += Number(/^Rss:\s+(\d+)/m.exec(data)?.[1] ?? 0);
  }
  return { pss, rss, workerPids: children };
}
async function freePort() {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((done) => probe.close(() => done()));
  return address.port;
}
function count(db: string) {
  return Number(
    command("python3", [
      "-c",
      "import sqlite3,sys; d=sqlite3.connect(sys.argv[1]); print(d.execute('SELECT value FROM counter WHERE id=1').fetchone()[0])",
      db,
    ]).trim(),
  );
}
try {
  const cert = join(dir, "cert.pem"),
    key = join(dir, "key.pem");
  command("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-subj",
    "/CN=localhost",
    "-days",
    "2",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ]);
  const source = join(dir, "main.bpl"),
    exe = join(dir, "server");
  const wal = process.env.BPL_BENCH_WAL === "1";
  writeFileSync(
    source,
    `
import [App],[Request],[Response] from "${resolve("packages/bpl-express/index.bpl")}";
import [SQLite],[Statement] from "${resolve("packages/bpl-sqlite/index.bpl")}";
import [Env] from "std/env.bpl";
extern malloc(size:ulong) ret *void;extern atoi(text:string) ret int;
global database:*SQLite;
frame initialize(){database=cast<*SQLite>(malloc(sizeof<SQLite>()));if(database==nullptr){throw "Allocation failed";}*database=SQLite.open(Env.getOr("BPL_BENCH_DB",""));}
frame health(_req:*Request,res:*Response){res.json("{\\"ok\\":true}");}
frame write(_req:*Request,res:*Response){database.exec("UPDATE counter SET value=value+1 WHERE id=1");res.json("{\\"ok\\":true}");}
frame main(argc:int,argv:*string) ret int {
 if(argc!=6){return 2;}local bootstrap:SQLite=SQLite.open(Env.getOr("BPL_BENCH_DB",""));
 ${wal ? 'local pragma:Statement=bootstrap.prepare("PRAGMA journal_mode=WAL");pragma.step();pragma.close();' : ""}
 bootstrap.exec("CREATE TABLE counter(id INTEGER PRIMARY KEY,value INTEGER NOT NULL)");bootstrap.exec("INSERT INTO counter VALUES(1,0)");bootstrap.close();
 local app:App=App.new();app.router.get("/health",health);app.router.post("/write",write);
 if(atoi(argv[3])==1){app.listenTLSWorkers(atoi(argv[1]),"127.0.0.1",atoi(argv[2]),initialize,argv[4],argv[5]);}else{app.listenWorkers(atoi(argv[1]),"127.0.0.1",atoi(argv[2]),initialize);}return 0;
}`,
  );
  command("bun", [
    resolve("index.ts"),
    "build",
    source,
    "-O",
    "3",
    "--clang-flag=-l:libsqlite3.so.0",
    "-o",
    exe,
  ]);
  const ca = readFileSync(cert);
  for (const tls of [false, true])
    for (const workers of [1, 2, 4]) {
      const port = await freePort(),
        db = join(dir, `db-${tls}-${workers}.sqlite`);
      child = Bun.spawn(
        [exe, String(port), String(workers), tls ? "1" : "0", cert, key],
        {
          env: { ...process.env, BPL_BENCH_DB: db },
          stdout: "ignore",
          stderr: "pipe",
        },
      );
      async function send(path: string) {
        return await new Promise<number>((done, reject) => {
          const req = (tls ? httpsRequest : httpRequest)(
            {
              hostname: "127.0.0.1",
              port,
              path,
              method: path === "/write" ? "POST" : "GET",
              ca,
              agent: false,
              timeout: 10000,
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on("data", (data) => chunks.push(data));
              res.on("error", reject);
              res.on("end", () => {
                if (
                  res.statusCode === 200 &&
                  Buffer.concat(chunks).toString() !== '{"ok":true}'
                )
                  reject(new Error("Invalid response"));
                else done(res.statusCode ?? 0);
              });
            },
          );
          req.on("error", reject);
          req.on("timeout", () => req.destroy(new Error("Request timed out")));
          req.end();
        });
      }
      let ready = false;
      for (let attempt = 0; attempt < 250; attempt++) {
        try {
          if ((await send("/health")) === 200) {
            ready = true;
            break;
          }
        } catch {}
        await Bun.sleep(20);
      }
      if (!ready) throw new Error("Benchmark listener did not start");
      for (const path of ["/health", "/write"])
        for (const concurrency of [1, 8, 32]) {
          const initial = memory(child.pid);
          let peakPss = initial.pss,
            peakRss = initial.rss;
          const sampler = setInterval(() => {
            try {
              const sample = memory(child!.pid);
              peakPss = Math.max(peakPss, sample.pss);
              peakRss = Math.max(peakRss, sample.rss);
            } catch {}
          }, 50);
          const beforeCount = path === "/write" ? count(db) : 0;
          const latencies: number[] = [];
          const statuses: Record<string, number> = {};
          let next = 0;
          const start = performance.now();
          try {
            await Promise.all(
              Array.from({ length: concurrency }, async () => {
                while (next++ < requests) {
                  const begin = performance.now();
                  try {
                    const status = String(await send(path));
                    statuses[status] = (statuses[status] ?? 0) + 1;
                  } catch {
                    statuses.transport_error =
                      (statuses.transport_error ?? 0) + 1;
                  }
                  latencies.push(performance.now() - begin);
                }
              }),
            );
          } finally {
            clearInterval(sampler);
          }
          const elapsed = performance.now() - start,
            finalMemory = memory(child.pid);
          latencies.sort((a, b) => a - b);
          const percentile = (p: number) =>
            Number(
              latencies[
                Math.min(
                  latencies.length - 1,
                  Math.ceil(latencies.length * p) - 1,
                )
              ]!.toFixed(3),
            );
          const databaseDelta =
            path === "/write" ? count(db) - beforeCount : null;
          const row = {
            protocol: tls ? "https" : "http",
            workers,
            path,
            concurrency,
            requests,
            wal,
            statuses,
            rps: Number(((requests * 1000) / elapsed).toFixed(2)),
            p50_ms: percentile(0.5),
            p95_ms: percentile(0.95),
            p99_ms: percentile(0.99),
            peak_pss_kib: Math.max(peakPss, finalMemory.pss),
            peak_rss_sum_kib: Math.max(peakRss, finalMemory.rss),
            database_delta: databaseDelta,
            workers_stable:
              JSON.stringify(initial.workerPids) ===
              JSON.stringify(finalMemory.workerPids),
          };
          rows.push(row);
          process.stderr.write(JSON.stringify(row) + "\n");
        }
      child.kill();
      await child.exited;
      child = undefined;
    }
  const report = {
    commit: command("git", ["rev-parse", "HEAD"]).trim(),
    date: new Date().toISOString(),
    requests_per_case: requests,
    notes:
      "Local loopback, Connection: close, trusted disposable TLS certificate. PSS includes supervisor + workers; summed RSS double-counts shared pages. Machine-specific results, not a production capacity claim.",
    rows,
  };
  const output = JSON.stringify(report, null, 2) + "\n";
  if (process.env.BPL_BENCH_OUTPUT)
    writeFileSync(process.env.BPL_BENCH_OUTPUT, output);
  else process.stdout.write(output);
  if (
    rows.some(
      (row) =>
        (row.statuses as Record<string, number>)["200"] !== requests ||
        row.workers_stable !== true ||
        (row.database_delta !== null && row.database_delta !== requests),
    )
  )
    process.exitCode = 1;
} finally {
  child?.kill();
  if (child) await child.exited;
  rmSync(dir, { recursive: true, force: true });
}

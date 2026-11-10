import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

// Builds apps/bpl-quant once, runs its deterministic self-test against the
// golden output, then (on Linux) starts the HTTP API on an ephemeral port.

const appDir = resolve("apps/bpl-quant");
// The app persists through bpl-sqlite, so it links the SQLite runtime.
const sqlitePath =
  spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], {
    encoding: "utf8",
    timeout: 10000,
  }).stdout?.trim() ?? "";
const hasSqlite = sqlitePath.includes("/");
let workDir = "";
let exe = "";
let buildOutput = "";
let buildStatus: number | null = null;

beforeAll(() => {
  if (!hasSqlite) return;
  workDir = mkdtempSync(join(tmpdir(), "bpl-quant-"));
  exe = join(workDir, "bpl-quant");
  const build = spawnSync(
    "bun",
    [
      resolve("index.ts"),
      "build",
      join(appDir, "src/main.bpl"),
      "-O",
      "2",
      "--clang-flag=-l:libsqlite3.so.0",
      "-o",
      exe,
    ],
    { encoding: "utf8", timeout: 170000 },
  );
  buildStatus = build.status;
  buildOutput = (build.stdout ?? "") + (build.stderr ?? "");
}, 180000);

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("no port");
  await new Promise<void>((done) => probe.close(() => done()));
  return address.port;
}

async function waitReady(base: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/health")).ok) return;
    } catch {
      await Bun.sleep(50);
    }
  }
  throw new Error("server did not become ready");
}

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe.skipIf(!hasSqlite)("bpl-quant", () => {
  test("builds", () => {
    expect(buildStatus, buildOutput).toBe(0);
  });

  test("self-test matches the golden output", () => {
    expect(buildStatus, buildOutput).toBe(0);
    const run = spawnSync(exe, ["selftest"], {
      encoding: "utf8",
      timeout: 60000,
    });
    const expected = readFileSync(
      join(appDir, "tests/selftest.expected"),
      "utf8",
    );
    expect(run.stdout).toBe(expected);
    expect(run.status, run.stderr).toBe(0);
  });

  test.skipIf(process.platform !== "linux")(
    "persists trades to SQLite, rate limits, and survives a load run",
    async () => {
      expect(buildStatus, buildOutput).toBe(0);
      const port = await freePort();
      const db = join(workDir, "quant.sqlite");
      const child = Bun.spawn([exe, "serve", String(port), "2"], {
        env: {
          ...process.env,
          BPLQUANT_DB: db,
          BPLQUANT_RATE_LIMIT: "100000",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const base = `http://127.0.0.1:${port}/api`;
      try {
        await waitReady(base);
        // Each worker persists its own trades; flush until one has written.
        let written = 0;
        for (let i = 0; i < 20 && written === 0; i++) {
          await fetch(`${base}/sim/ACME?events=500&seed=${i + 1}`, {
            method: "POST",
          });
          const flush = await fetch(`${base}/store/flush`, { method: "POST" });
          written = ((await flush.json()) as { written: number }).written;
        }
        expect(written).toBeGreaterThan(0);
        const stats = (await (await fetch(`${base}/store/stats`)).json()) as {
          trades: number;
          integrity_ok: boolean;
        };
        expect(stats.trades).toBeGreaterThanOrEqual(written);
        expect(stats.integrity_ok).toBe(true);
        const limited = await fetch(`${base}/symbols`);
        expect(limited.headers.get("ratelimit-limit")).toBe("100000");
        const load = spawnSync(
          exe,
          ["loadgen", String(port), "400", "4", "read"],
          {
            encoding: "utf8",
            timeout: 60000,
          },
        );
        expect(load.status, load.stdout + load.stderr).toBe(0);
        expect(load.stdout).toContain("2xx/3xx=400");
      } finally {
        child.kill();
        await child.exited;
      }
    },
    90000,
  );

  test.skipIf(process.platform !== "linux")(
    "serves the desk, protocol, portfolio and analytics routes",
    async () => {
      expect(buildStatus, buildOutput).toBe(0);
      const port = await freePort();
      const child = Bun.spawn([exe, "serve", String(port)], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const base = `http://127.0.0.1:${port}/api`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const call = async (path: string, init?: RequestInit): Promise<any> => {
        // The server closes every connection; disable pooling so a request
        // never lands on a socket the server already closed.
        const res = await fetch(base + path, { ...init, keepalive: false });
        return {
          status: res.status,
          cache: res.headers.get("x-cache"),
          body: await res.json(),
        };
      };
      const send = (method: string, body: unknown): RequestInit => ({
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      try {
        await waitReady(base);
        const routes = await call("/routes");
        expect(routes.body.count).toBeGreaterThanOrEqual(155);

        // Risk-checked journaled desk.
        const ask = await call(
          "/oms/orders",
          send("POST", {
            symbol: "ACME",
            account: "alice",
            side: "sell",
            price: 100.5,
            qty: 300,
          }),
        );
        expect(ask.status).toBe(201);
        expect(ask.body.risk.passed).toBe(true);
        await call("/oms/limits/bob", send("PUT", { max_order_qty: 50 }));
        const blocked = await call(
          "/oms/orders",
          send("POST", {
            symbol: "ACME",
            account: "bob",
            side: "buy",
            price: 100.5,
            qty: 100,
          }),
        );
        expect(blocked.status).toBe(403);
        expect(blocked.body.risk.rule).toBe("order_quantity");
        const fix = await call(
          "/fix/order",
          send("POST", {
            clordid: "x1",
            symbol: "ACME",
            side: "buy",
            qty: 60,
            price: 100.5,
          }),
        );
        const execTypes = fix.body.messages
          .map((m: { exec_type?: string }) => m.exec_type)
          .filter(Boolean);
        expect(execTypes).toEqual(["0", "F"]);
        const positions = await call(
          "/oms/positions?filter=" + encodeURIComponent('account = "alice"'),
        );
        expect(positions.body.positions[0].position).toBe(-60);
        await call("/oms/snapshot", { method: "POST" });
        await call(
          "/oms/orders",
          send("POST", {
            symbol: "ACME",
            account: "carol",
            side: "buy",
            price: 100.5,
            qty: 40,
          }),
        );
        const recover = await call("/oms/recover", { method: "POST" });
        expect(recover.status).toBe(200);
        expect(recover.body.matches).toBe(true);
        expect(recover.body.replayed).toBeGreaterThan(0);
        const fromScratch = await call("/oms/recover?snapshot=false", {
          method: "POST",
        });
        expect(fromScratch.body.state_hash).toBe(recover.body.state_hash);
        const breaches = await call("/oms/breaches");
        expect(breaches.body.by_rule.order_quantity).toBe(1);
        const surveillance = await call("/oms/surveillance");
        expect(surveillance.body.records).toBeGreaterThan(10);

        // Market data feed replay with packet loss.
        const feed = await call("/feed/replay?events=3000&drop_every=5&seed=2");
        expect(feed.body.replay.books_match).toBe(true);
        expect(feed.body.replay.gaps).toBeGreaterThan(0);
        const parsed = await fetch(base + "/fix/parse", {
          keepalive: false,
          method: "POST",
          body: "8=FIX.4.4|9=5|35=0|10=000|",
        });
        expect(parsed.status).toBe(422);
        expect(((await parsed.json()) as { valid: boolean }).valid).toBe(false);

        // Columnar cache: a repeated query is served from the cache.
        await call("/sim/ACME?events=2000&seed=5", { method: "POST" });
        const q =
          "/columnar/trades?group=side&aggs=" +
          encodeURIComponent("count(*),vwap(price,qty)");
        const first = await call(q);
        const second = await call(q);
        expect(first.cache).toBe("miss");
        expect(second.cache).toBe("hit");
        expect(second.body).toEqual(first.body);

        // Portfolio analytics.
        const stress = await call("/stress/demo?mc_paths=1000");
        expect(stress.body.scenarios.length).toBe(7);
        const brinson = await call(
          "/attribution/brinson",
          send("POST", {
            sectors: [
              { name: "a", wp: 0.6, wb: 0.5, rp: 0.1, rb: 0.08 },
              { name: "b", wp: 0.4, wb: 0.5, rp: 0.02, rb: 0.03 },
            ],
          }),
        );
        const b = brinson.body;
        expect(b.allocation + b.selection + b.interaction).toBeCloseTo(
          b.active_return,
          12,
        );
        const rebalance = await call(
          "/rebalance",
          send("POST", {
            holdings: [
              { symbol: "ACME", shares: 100 },
              { symbol: "GLOBEX", shares: 500, lot: 10 },
            ],
            targets: { ACME: 0.5, GLOBEX: 0.5 },
            cash: 1000,
          }),
        );
        expect(rebalance.body.cash_after).toBeGreaterThanOrEqual(0);
        expect(rebalance.body.tracking_after).toBeLessThan(
          rebalance.body.tracking_before,
        );
        const schedule = await call(
          "/tca/schedule?shares=1000000&periods=5&horizon=5&sigma=0.95&eta=0.0000025&gamma=0.00000025&epsilon=0.0625&lambda=0.000001",
        );
        expect(schedule.body.kappa).toBeCloseTo(0.6070761632, 8);
        const condor = await call(
          "/options/strategy?template=iron_condor&points=0",
        );
        expect(condor.body.breakevens.length).toBe(2);
        const regime = await call("/tsa/ACME/regime");
        expect(regime.body.states.length).toBe(2);
        const span = await call(
          "/risk/span",
          send("POST", {
            products: [
              {
                name: "ES",
                price: 5000,
                price_range: 0.06,
                multiplier: 50,
                futures: 1,
              },
            ],
          }),
        );
        expect(span.body.total_margin).toBeCloseTo(15000, 6);
        const performance = await call("/stats/GLOBEX/performance");
        expect(performance.body.drawdowns.length).toBeGreaterThan(0);

        // WebSocket push feed.
        const messages: string[] = [];
        const closed = await new Promise<number>((done) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws/feed`);
          ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data as string);
            messages.push(m.type);
            if (m.type === "hello") {
              ws.send(JSON.stringify({ op: "subscribe", symbol: "ACME" }));
              ws.send(JSON.stringify({ op: "sim", events: 300, seed: 4 }));
              ws.send(JSON.stringify({ op: "close" }));
            }
          };
          ws.onclose = (ev) => done(ev.code);
        });
        expect(closed).toBe(1000);
        expect(messages.slice(0, 3)).toEqual(["hello", "book", "trades"]);
        const frames = await new Promise<number>((done) => {
          let count = 0;
          const ws = new WebSocket(
            `ws://127.0.0.1:${port}/api/ws/feed?format=itch&events=500`,
          );
          ws.binaryType = "arraybuffer";
          ws.onmessage = () => count++;
          ws.onclose = () => done(count);
        });
        expect(frames).toBeGreaterThan(1);
      } finally {
        child.kill();
        await child.exited;
      }
    },
    90000,
  );

  test.skipIf(process.platform !== "linux")(
    "serves the JSON API on an ephemeral port",
    async () => {
      expect(buildStatus, buildOutput).toBe(0);
      const port = await freePort();
      const child = Bun.spawn([exe, "serve", String(port)], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const base = `http://127.0.0.1:${port}/api`;
      const getJson = async (path: string, init?: RequestInit) => {
        const res = await fetch(base + path, init);
        // Response shapes are asserted field by field below.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = (await res.json()) as any;
        return { status: res.status, body };
      };
      try {
        await waitReady(base);
        const routes = await getJson("/routes");
        expect(routes.body.count).toBeGreaterThanOrEqual(50);

        const post = (body: unknown): RequestInit => ({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const ask = await getJson(
          "/orders",
          post({
            symbol: "ACME",
            account: "a",
            side: "sell",
            price: 101,
            qty: 100,
          }),
        );
        expect(ask.status).toBe(201);
        expect(ask.body.resting).toBe(true);
        const buy = await getJson(
          "/orders",
          post({
            symbol: "ACME",
            account: "b",
            side: "buy",
            type: "market",
            qty: 40,
          }),
        );
        expect(buy.body.status).toBe("filled");
        expect(buy.body.fills[0].price).toBe(101);
        const invalid = await getJson(
          "/orders",
          post({ symbol: "acme", side: "x" }),
        );
        expect(invalid.status).toBe(422);
        expect(invalid.body.fields.length).toBeGreaterThan(2);

        const sim = await getJson("/sim/ACME?events=2000&seed=3", {
          method: "POST",
        });
        expect(sim.body.trades).toBeGreaterThan(100);
        const trades = await getJson(
          "/trades?symbol=ACME&limit=5&filter=" +
            encodeURIComponent('qty >= 100 and side in ["buy", "sell"]') +
            "&sort=price:desc",
        );
        expect(trades.body.count).toBe(5);
        const prices = trades.body.trades.map(
          (t: { price: number }) => t.price,
        );
        expect([...prices].sort((a, b) => b - a)).toEqual(prices);
        const badFilter = await getJson(
          "/trades?filter=" + encodeURIComponent("qty >"),
        );
        expect(badFilter.status).toBe(400);
        const valid = await getJson("/engine/validate");
        expect(valid.body.valid).toBe(true);

        const bs = await getJson(
          "/price/bs?spot=100&strike=100&rate=0.05&vol=0.2&expiry=1",
        );
        expect(bs.body.price).toBeCloseTo(10.450583572, 6);
        const iv = await getJson(
          "/price/iv",
          post({ spot: 100, strike: 100, rate: 0.05, expiry: 1, price: 12 }),
        );
        expect(iv.body.implied_vol).toBeCloseTo(0.2411169, 6);
        const tree = await getJson(
          "/price/tree?spot=100&strike=100&rate=0.05&vol=0.2&expiry=1&type=put&american=true&steps=500",
        );
        expect(tree.body.price).toBeCloseTo(6.08881, 4);

        const indicator = await getJson("/indicators/ACME?name=rsi&tail=1");
        expect(indicator.body.values.length).toBe(1);
        const risk = await getJson(
          "/risk/optimize?symbols=ACME,GLOBEX,HOOLI&method=risk_parity",
        );
        const weights = Object.values(
          risk.body.risk_parity.weights,
        ) as number[];
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        const matrix = await getJson(
          "/math/matrix",
          post({
            op: "inverse",
            a: [
              [4, 7],
              [2, 6],
            ],
          }),
        );
        expect(matrix.body.result[0][0]).toBeCloseTo(0.6, 12);

        const csv = await fetch(base + "/trades.csv?limit=2");
        expect(csv.headers.get("content-type")).toContain("text/csv");
        expect((await csv.text()).split("\r\n")[0]).toBe(
          '"id","symbol","price","qty","side","buyer","seller","time"',
        );
        const metrics = await fetch(`http://127.0.0.1:${port}/metrics`);
        expect(await metrics.text()).toContain("bplquant_requests_total");
        const missing = await getJson("/no-such-route");
        expect(missing.status).toBe(404);
      } finally {
        child.kill();
        await child.exited;
      }
    },
    60000,
  );
});

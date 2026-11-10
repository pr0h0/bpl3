import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";

// Builds apps/bpl-quant once, runs its deterministic self-test against the
// golden output, then (on Linux) starts the HTTP API on an ephemeral port.

const appDir = resolve("apps/bpl-quant");
let workDir = "";
let exe = "";
let buildOutput = "";
let buildStatus: number | null = null;

beforeAll(() => {
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
      "-o",
      exe,
    ],
    { encoding: "utf8", timeout: 170000 },
  );
  buildStatus = build.status;
  buildOutput = (build.stdout ?? "") + (build.stderr ?? "");
}, 180000);

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("bpl-quant", () => {
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
    "serves the JSON API on an ephemeral port",
    async () => {
      expect(buildStatus, buildOutput).toBe(0);
      const probe = createServer();
      await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
      const address = probe.address();
      if (!address || typeof address === "string") throw new Error("no port");
      const port = address.port;
      await new Promise<void>((done) => probe.close(() => done()));
      const child = Bun.spawn([exe, "serve", String(port)], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const base = `http://127.0.0.1:${port}/api`;
      const getJson = async (path: string, init?: RequestInit) => {
        const res = await fetch(base + path, init);
        return { status: res.status, body: await res.json() };
      };
      try {
        let ready = false;
        for (let i = 0; i < 100 && !ready; i++) {
          try {
            ready = (await fetch(base + "/health")).ok;
          } catch {
            await Bun.sleep(50);
          }
        }
        expect(ready).toBe(true);
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

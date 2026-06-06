import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import { spawn, type ChildProcess } from "child_process";
import { readFileSync } from "fs";

setDefaultTimeout(20_000);

const PORT = 20_000 + (process.pid % 20_000);
const API_BASE = `http://127.0.0.1:${PORT}`;
const HELLO_WORLD_SOURCE = JSON.parse(
  readFileSync("playground/examples/01-hello-world.json", "utf8"),
).code.join("\n");
const IMPORTED_PRINTF_SOURCE = [
  'import [printf] from "std/c.bpl";',
  'frame main() ret int { printf("Imported printf\\n"); return 0; }',
].join("\n");
const COMMAND_ARGS_SOURCE = JSON.parse(
  readFileSync("playground/examples/20-command-args.json", "utf8"),
).code.join("\n");

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Playground test server did not become healthy");
}

async function compile(body: Record<string, unknown>): Promise<{
  status: number;
  raw: string;
  json: Record<string, unknown>;
}> {
  return await postJson("/compile", body);
}

async function postJson(
  pathname: string,
  body: Record<string, unknown>,
): Promise<{
  status: number;
  raw: string;
  json: Record<string, unknown>;
}> {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.text();

  return {
    status: response.status,
    raw,
    json: JSON.parse(raw),
  };
}

describe("Playground compile API contract", () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn("bun", ["playground/backend/server.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForServer();
  });

  afterAll(() => {
    server.kill();
  });

  test("keeps default run responses small and loads debug artifacts only on request", async () => {
    const runResponse = await compile({ code: HELLO_WORLD_SOURCE });

    expect(runResponse.status).toBe(200);
    expect(runResponse.json.success).toBe(true);
    expect(runResponse.json.output).toBe("Hello, World!\n");
    expect(runResponse.json.ir).toBeUndefined();
    expect(runResponse.json.ast).toBeUndefined();
    expect(runResponse.json.tokens).toBeUndefined();
    expect(Buffer.byteLength(runResponse.raw)).toBeLessThan(16 * 1024);

    const debugResponse = await compile({
      code: HELLO_WORLD_SOURCE,
      includeArtifacts: true,
    });

    expect(debugResponse.status).toBe(200);
    expect(debugResponse.json.success).toBe(true);
    expect(typeof debugResponse.json.ir).toBe("string");
    expect(typeof debugResponse.json.ast).toBe("string");
    expect(typeof debugResponse.json.tokens).toBe("string");
    expect(Buffer.byteLength(debugResponse.raw)).toBeGreaterThan(
      Buffer.byteLength(runResponse.raw),
    );
  });

  test("keeps debug AST artifacts compact and free of resolved backreferences", async () => {
    const debugResponse = await compile({
      code: HELLO_WORLD_SOURCE,
      includeArtifacts: true,
      execute: false,
    });

    expect(debugResponse.status).toBe(200);
    expect(debugResponse.json.success).toBe(true);
    expect(typeof debugResponse.json.ast).toBe("string");
    expect(debugResponse.json.ast).toContain('"kind": "Program"');
    expect(debugResponse.json.ast).not.toContain("resolvedDeclaration");
    expect(debugResponse.json.ast).not.toContain("resolvedType");
    expect(Buffer.byteLength(debugResponse.raw)).toBeLessThan(1024 * 1024);
  });

  test("reuses cached compile-only debug artifacts for unchanged source", async () => {
    await fetch(`${API_BASE}/logs/clear`, { method: "POST" });

    const firstDebugResponse = await compile({
      code: HELLO_WORLD_SOURCE,
      includeArtifacts: true,
      execute: false,
    });
    const secondDebugResponse = await compile({
      code: HELLO_WORLD_SOURCE,
      includeArtifacts: true,
      execute: false,
    });

    expect(firstDebugResponse.status).toBe(200);
    expect(firstDebugResponse.json.success).toBe(true);
    expect(secondDebugResponse.status).toBe(200);
    expect(secondDebugResponse.json).toEqual(firstDebugResponse.json);

    const logsResponse = await fetch(`${API_BASE}/logs?limit=200`);
    const logs = (await logsResponse.json()) as {
      logs: Array<{ message?: string }>;
    };
    const cacheHitLogs = logs.logs.filter((entry) =>
      entry.message?.includes("Reusing cached compile-only response"),
    );
    expect(cacheHitLogs.length).toBeGreaterThanOrEqual(1);
  });

  test("reruns cached native binaries with current request argv", async () => {
    const oneArg = await compile({
      code: COMMAND_ARGS_SOURCE,
      args: ["one"],
      includeArtifacts: false,
    });
    const threeArgs = await compile({
      code: COMMAND_ARGS_SOURCE,
      args: ["one", "two", "three"],
      includeArtifacts: false,
    });

    expect(oneArg.status).toBe(200);
    expect(oneArg.json.success).toBe(true);
    expect(oneArg.json.output).toContain("Current argument count: 2\n");
    expect(oneArg.json.ir).toBeUndefined();
    expect(threeArgs.status).toBe(200);
    expect(threeArgs.json.success).toBe(true);
    expect(threeArgs.json.output).toContain("Current argument count: 4\n");
    expect(threeArgs.json.ir).toBeUndefined();
  });

  test("keeps import-using artifact-free native runs on module resolution", async () => {
    const response = await compile({
      code: IMPORTED_PRINTF_SOURCE,
      includeArtifacts: false,
    });

    expect(response.status).toBe(200);
    expect(response.json.success).toBe(true);
    expect(response.json.output).toBe("Imported printf\n");
    expect(response.json.ir).toBeUndefined();
  });

  test("rejects malformed compile payloads with client errors", async () => {
    const missingCode = await compile({});

    expect(missingCode.status).toBe(400);
    expect(missingCode.json).toEqual({
      success: false,
      error: "Invalid request: code must be a string.",
    });

    const invalidArgs = await compile({
      code: HELLO_WORLD_SOURCE,
      args: "not-an-array",
    });

    expect(invalidArgs.status).toBe(400);
    expect(invalidArgs.json).toEqual({
      success: false,
      error: "Invalid request: args must be an array of strings.",
    });
  });

  test("keeps the browser Run Code path on the fast artifact-free contract", () => {
    const appSource = readFileSync("playground/frontend/app.js", "utf8");

    expect(appSource).toContain("includeArtifacts: false");
    expect(appSource).toContain("async function loadCompileArtifacts");
    expect(appSource).toContain("includeArtifacts: true");
    expect(appSource).toContain("execute: false");
  });

  test("uses collision-safe temporary directories for playground compiler requests", () => {
    const serverSource = readFileSync("playground/backend/server.ts", "utf8");

    expect(serverSource).toMatch(
      /fs\.mkdtempSync\(\s*path\.join\(os\.tmpdir\(\),\s*"bpl-playground-"\)\s*\)/,
    );
    expect(serverSource).toMatch(
      /fs\.mkdtempSync\(\s*path\.join\(os\.tmpdir\(\),\s*"bpl-playground-wasm-"\),?\s*\)/,
    );
    expect(serverSource).not.toContain('path.join("/tmp", `bpl-playground-');
  });

  test("uses the cached native runtime file resolver for playground links", () => {
    const serverSource = readFileSync("playground/backend/server.ts", "utf8");

    expect(serverSource).toContain("resolvePlaygroundNativeRuntimeFiles");
    expect(serverSource).not.toContain("const runtimeFiles: string[] = []");
    expect(serverSource).not.toContain('"runtime.ll");\n      if (fs.existsSync');
  });

  test("fast-paths no-import artifact-free native compiles", () => {
    const serverSource = readFileSync("playground/backend/server.ts", "utf8");
    const compileStart = serverSource.indexOf("async function compileAndRun");
    const compileEnd = serverSource.indexOf(
      "async function compileToWasm",
      compileStart,
    );

    expect(compileStart).toBeGreaterThanOrEqual(0);
    expect(compileEnd).toBeGreaterThan(compileStart);

    const compileSource = serverSource.slice(compileStart, compileEnd);
    expect(serverSource).toContain("function sourceMayUseBplImport");
    expect(serverSource).toContain("/\\bimport\\b/.test(source)");
    expect(compileSource).toContain(
      "const resolveImports = includeArtifacts || sourceMayUseBplImport(req.code);",
    );
    expect(compileSource.indexOf("const resolveImports")).toBeLessThan(
      compileSource.indexOf("new Compiler"),
    );
    expect(compileSource).toContain("resolveImports,");
    expect(compileSource).not.toContain("resolveImports: true");
  });

  test("caches artifact-free native binaries before creating request temp dirs", () => {
    const serverSource = readFileSync("playground/backend/server.ts", "utf8");
    const compileStart = serverSource.indexOf("async function compileAndRun");
    const compileEnd = serverSource.indexOf(
      "async function compileToWasm",
      compileStart,
    );

    expect(compileStart).toBeGreaterThanOrEqual(0);
    expect(compileEnd).toBeGreaterThan(compileStart);

    const compileSource = serverSource.slice(compileStart, compileEnd);
    expect(serverSource).toContain("NATIVE_BINARY_CACHE_MAX_ENTRIES");
    expect(serverSource).toContain("getNativeBinaryCacheKey(req.code)");
    expect(serverSource).toContain("rememberNativeBinary");
    expect(serverSource).toContain("runCompiledNativeBinary");
    expect(compileSource.indexOf("getCachedNativeBinary")).toBeLessThan(
      compileSource.indexOf("fs.mkdtempSync"),
    );
    expect(compileSource).toContain("if (cachedNativeBinary)");
    expect(compileSource).toContain("!includeArtifacts");
    expect(compileSource).toContain(
      "const treeShakeTopLevelFunctions = execute && !includeArtifacts;",
    );
    expect(compileSource).toContain("treeShakeTopLevelFunctions,");
  });
});

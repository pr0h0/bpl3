import path from "path";
import { JsonDirectoryCache } from "./jsonDirectoryCache";
import { StaticTextFileCache } from "./staticTextFileCache";
import { logger, stats, getUptime, updateStats } from "./telemetry";
import { validateCompileRequestPayload } from "./protocol";
import {
  createPlaygroundRunner,
  RunnerError,
  type PlaygroundOperation,
} from "./runner";
import type { CompileRequest } from "./protocol";
const staticTextFileCache = new StaticTextFileCache();
const jsonDirectoryCache = new JsonDirectoryCache();
function readStaticTextFile(filePath: string): string {
  return staticTextFileCache.read(filePath);
}

function readPlaygroundJsonDirectory<T>(
  directoryPath: string,
  label: string,
): T[] {
  return jsonDirectoryCache.read<T>(directoryPath, {
    onFileError: (filePath, error) => {
      console.error(
        `Failed to load ${label} ${path.basename(filePath)}:`,
        error,
      );
    },
  });
}

function invalidRequestResponse(
  error: string,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status: 400,
    headers,
  });
}

// Get examples
function getExamples() {
  const examplesDir = path.join(__dirname, "../examples");
  return readPlaygroundJsonDirectory(examplesDir, "example");
}

// Get tutorials
function getTutorials() {
  const tutorialsDir = path.join(__dirname, "../tutorials");
  return readPlaygroundJsonDirectory(tutorialsDir, "tutorial");
}

// Server
const runner = await createPlaygroundRunner();
if (runner.mode === "docker") {
  setInterval(() => {
    void runner
      .recover()
      .catch(() => logger.warn("Docker recovery unavailable; retrying."));
  }, 15_000).unref();
}
async function runJob(operation: PlaygroundOperation, request: CompileRequest) {
  const start = Date.now();
  try {
    const result = await runner.execute(operation, request);
    if (runner.mode === "docker" && operation !== "format")
      updateStats(result.success, Date.now() - start);
    return result;
  } catch (error) {
    if (runner.mode === "docker" && operation !== "format")
      updateStats(false, Date.now() - start);
    throw error;
  }
}
logger.info(`Playground runner: ${runner.mode}`);
if (runner.mode === "host")
  logger.warn(
    "Host mode executes code with your account's access. Use only for trusted local development.",
  );
const port = Number.parseInt(process.env.PORT || "3001", 10);
const server = Bun.serve({
  port,
  hostname:
    runner.mode === "host"
      ? "127.0.0.1"
      : (process.env.BPL_PLAYGROUND_HOST ?? "127.0.0.1"),
  maxRequestBodySize: 512 * 1024,
  idleTimeout: 60,
  async fetch(req) {
    const url = new URL(req.url);
    const startTime = Date.now();

    // Loopback binding alone does not stop websites from accessing local services.
    if (
      runner.mode === "host" &&
      (!["127.0.0.1", "localhost"].includes(url.hostname) ||
        (req.headers.has("origin") && req.headers.get("origin") !== url.origin))
    ) {
      return Response.json(
        {
          success: false,
          error: "Host mode only accepts local, same-origin requests.",
        },
        { status: 403 },
      );
    }

    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": runner.mode === "host" ? url.origin : "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // Log all requests
    logger.debug(`${req.method} ${url.pathname}`, {
      ip: req.headers.get("x-forwarded-for") || "unknown",
    });

    // GET /health - Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      const uptime = getUptime();
      const healthData = {
        status: runner.ready() ? "ok" : "unavailable",
        runner: runner.mode,
        uptime,
        timestamp: new Date().toISOString(),
      };
      logger.debug("Health check", healthData);
      return new Response(JSON.stringify(healthData), {
        headers,
        status: runner.ready() ? 200 : 503,
      });
    }

    // GET /stats - Statistics endpoint
    if (url.pathname === "/stats" && req.method === "GET") {
      const statsData = {
        ...stats,
        uptime: getUptime(),
        successRate:
          stats.totalRequests > 0
            ? (
                (stats.successfulCompilations / stats.totalRequests) *
                100
              ).toFixed(2) + "%"
            : "N/A",
      };
      logger.debug("Stats requested", statsData);
      return new Response(JSON.stringify(statsData), { headers });
    }

    // GET /logs - Get recent logs
    if (url.pathname === "/logs" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const logs = logger.getLogs(limit);
      return new Response(JSON.stringify({ logs }), { headers });
    }

    // POST /logs/clear - Clear logs
    if (url.pathname === "/logs/clear" && req.method === "POST") {
      logger.clearLogs();
      logger.info("Logs cleared");
      return new Response(
        JSON.stringify({ success: true, message: "Logs cleared" }),
        { headers },
      );
    }

    // POST /format
    if (url.pathname === "/format" && req.method === "POST") {
      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return invalidRequestResponse(
            "Invalid request: body must be valid JSON.",
            headers,
          );
        }
        const validation = validateCompileRequestPayload(body);
        if (!validation.success)
          return invalidRequestResponse(validation.error, headers);
        const result = await runJob("format", validation.request);
        return new Response(JSON.stringify(result), {
          headers,
          status: result.success ? 200 : 500,
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ success: false, error: String(error) }),
          {
            headers,
            status: error instanceof RunnerError ? error.status : 500,
          },
        );
      }
    }

    // GET /examples
    if (url.pathname === "/examples" && req.method === "GET") {
      const examples = getExamples();
      stats.totalExamplesLoaded = examples.length;
      logger.info(`Examples loaded: ${examples.length}`);
      return new Response(JSON.stringify(examples), { headers });
    }

    // GET /tutorials
    if (url.pathname === "/tutorials" && req.method === "GET") {
      const tutorials = getTutorials();
      logger.info(`Tutorials loaded: ${tutorials.length}`);
      return new Response(JSON.stringify(tutorials), { headers });
    }

    // POST /compile
    if (url.pathname === "/compile" && req.method === "POST") {
      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return invalidRequestResponse(
            "Invalid request: body must be valid JSON.",
            headers,
          );
        }

        const validation = validateCompileRequestPayload(body);
        if (!validation.success) {
          return invalidRequestResponse(validation.error, headers);
        }

        const result = await runJob("compile", validation.request);
        return new Response(JSON.stringify(result), { headers });
      } catch (e: any) {
        logger.error("Compile endpoint error", { error: e.message });
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          {
            status: e instanceof RunnerError ? e.status : 500,
            headers,
          },
        );
      }
    }

    // POST /wasm
    if (url.pathname === "/wasm" && req.method === "POST") {
      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return invalidRequestResponse(
            "Invalid request: body must be valid JSON.",
            headers,
          );
        }

        const validation = validateCompileRequestPayload(body);
        if (!validation.success) {
          return invalidRequestResponse(validation.error, headers);
        }

        const result = await runJob("wasm", validation.request);
        return new Response(JSON.stringify(result), { headers });
      } catch (e: any) {
        logger.error("Wasm endpoint error", { error: e.message });
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          {
            status: e instanceof RunnerError ? e.status : 500,
            headers,
          },
        );
      }
    }

    // Static files
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = readStaticTextFile(
        path.join(__dirname, "../frontend/index.html"),
      );
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/tutorial.html") {
      const html = readStaticTextFile(
        path.join(__dirname, "../frontend/tutorial.html"),
      );
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/style.css") {
      const css = readStaticTextFile(
        path.join(__dirname, "../frontend/style.css"),
      );
      return new Response(css, {
        headers: { ...headers, "Content-Type": "text/css" },
      });
    }

    if (url.pathname === "/tutorial.css") {
      const css = readStaticTextFile(
        path.join(__dirname, "../frontend/tutorial.css"),
      );
      return new Response(css, {
        headers: { ...headers, "Content-Type": "text/css" },
      });
    }

    if (url.pathname === "/app.js") {
      const js = readStaticTextFile(path.join(__dirname, "../frontend/app.js"));
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    if (url.pathname === "/wasmHostAdapter.js") {
      const js = readStaticTextFile(
        path.join(__dirname, "../frontend/wasmHostAdapter.js"),
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    if (url.pathname === "/browserWasmRuntime.js") {
      const js = readStaticTextFile(
        path.join(__dirname, "../frontend/browserWasmRuntime.js"),
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    if (url.pathname === "/tutorial.js") {
      const js = readStaticTextFile(
        path.join(__dirname, "../frontend/tutorial.js"),
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    return new Response("Not Found", { status: 404, headers });
  },
});

logger.info("=".repeat(60));
logger.info("🚀 BPL Playground Server Started");
logger.info("=".repeat(60));
logger.info(`Server running at http://localhost:${server.port}`);
logger.info(`Examples available at http://localhost:${server.port}/examples`);
logger.info(`Health check: http://localhost:${server.port}/health`);
logger.info(`Statistics: http://localhost:${server.port}/stats`);
logger.info(`Logs: http://localhost:${server.port}/logs`);
logger.info("=".repeat(60));

// Periodic stats logging
setInterval(() => {
  const uptime = getUptime();
  logger.info("Periodic stats update", {
    uptime: `${uptime}s`,
    totalRequests: stats.totalRequests,
    successRate:
      stats.totalRequests > 0
        ? `${((stats.successfulCompilations / stats.totalRequests) * 100).toFixed(2)}%`
        : "N/A",
    avgCompileTime: `${stats.averageCompileTime.toFixed(2)}ms`,
  });
}, 300000); // Every 5 minutes

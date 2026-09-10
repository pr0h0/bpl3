import { validateCompileRequestPayload } from "./protocol";

// stdout is reserved for one JSON response. Compiler diagnostics go to stderr.
console.log = console.error;
try {
  const job = JSON.parse(await Bun.stdin.text());
  const validation = validateCompileRequestPayload(job.request);
  if (!validation.success) throw new Error(validation.error);
  const engine = await import("./engine");
  const result =
    job.operation === "compile"
      ? await engine.compileAndRun(validation.request)
      : job.operation === "wasm"
        ? await engine.compileToWasm(validation.request)
        : job.operation === "format"
          ? engine.formatCode(validation.request)
          : { success: false, error: "Unknown playground operation" };
  await Bun.write(Bun.stdout, JSON.stringify(result));
} catch (error) {
  await Bun.write(
    Bun.stdout,
    JSON.stringify({ success: false, error: String(error) }),
  );
}
// Finishing PID 1's command also terminates any remaining native descendants.
process.exit(0);

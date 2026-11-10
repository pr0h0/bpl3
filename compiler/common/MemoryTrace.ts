/**
 * A full collection between compiler phases. The heap otherwise grows past
 * the garbage of the previous phase before collecting it, and the process
 * keeps those pages: forcing it here cut the peak of a 48k-line build from
 * about 830 MB to about 640 MB, for well under a second.
 */
export function collectGarbage(): void {
  (globalThis as { Bun?: { gc(force: boolean): void } }).Bun?.gc(true);
}

/**
 * Between phases, collects garbage (see collectGarbage); with
 * `BPL_TRACE_MEMORY=1` it also prints the process's resident and heap size after each
 * compiler phase to stderr, to find which phase dominates peak memory.
 */
export function traceMemory(phase: string): void {
  collectGarbage();
  if (process.env.BPL_TRACE_MEMORY !== "1") return;
  const usage = process.memoryUsage();
  const mb = (bytes: number) => (bytes / 1048576).toFixed(0);
  process.stderr.write(
    `[memory] ${phase}: rss ${mb(usage.rss)} MB, heap ${mb(usage.heapUsed)} MB\n`,
  );
  if (process.env.BPL_TRACE_MEMORY_TYPES === "1") {
    const { heapStats } = require("bun:jsc") as {
      heapStats(): { objectTypeCounts: Record<string, number> };
    };
    const counts = Object.entries(heapStats().objectTypeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([type, count]) => `${type}=${count}`)
      .join(" ");
    process.stderr.write(`[memory]   ${counts}\n`);
  }
}

import type { ChildProcess } from "node:child_process";

/**
 * The port a playground server started with `PORT=0` actually bound, read
 * from its "Server running at" log line on stderr. Letting the server bind
 * port 0 itself leaves no window in which another process can take a port
 * reserved in advance. The child's stderr must be piped.
 */
export function listeningPort(
  child: ChildProcess,
  timeoutMs = 20_000,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = "";
    const finish = (error?: Error, port?: number) => {
      clearTimeout(timer);
      child.off("exit", onExit);
      // Keep draining stderr so the server never blocks on a full pipe.
      child.stderr?.off("data", onData).resume();
      if (error) reject(error);
      else resolve(port!);
    };
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = /Server running at http:\/\/[^\s:]+:(\d+)/.exec(output);
      if (match) finish(undefined, Number(match[1]));
    };
    const onExit = (code: number | null) =>
      finish(new Error(`Server exited (${code}) before listening:\n${output}`));
    const timer = setTimeout(
      () => finish(new Error(`Server did not report its port:\n${output}`)),
      timeoutMs,
    );
    if (!child.stderr) {
      finish(new Error("Server stderr must be piped to read its port"));
      return;
    }
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

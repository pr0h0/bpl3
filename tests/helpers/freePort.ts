import { createServer } from "node:net";

/**
 * A TCP port the OS reports free on 127.0.0.1. Deriving ports from the PID
 * collides between concurrent runs; binding port 0 does not.
 */
export async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  await new Promise<void>((done) => probe.close(() => done()));
  if (!address || typeof address === "string") {
    throw new Error("Could not reserve a TCP port");
  }
  return address.port;
}

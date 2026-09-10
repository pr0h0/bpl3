import { isIP } from "net";
import { RunnerError } from "./runner";

function normalizeAddress(address: string): string {
  if (address.startsWith("::ffff:") && isIP(address.slice(7)) === 4)
    return address.slice(7);
  return isIP(address) === 6
    ? new URL(`http://[${address}]`).hostname.slice(1, -1)
    : address;
}

export function trustedProxyAddresses(value = ""): Set<string> {
  const addresses = value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (addresses.some((address) => !isIP(address)))
    throw new Error(
      "BPL_PLAYGROUND_TRUSTED_PROXIES must contain exact IP addresses.",
    );
  return new Set(addresses.map(normalizeAddress));
}

export function clientAddress(
  peer: string,
  headers: Headers,
  trusted: Set<string>,
): string {
  peer = normalizeAddress(peer);
  const forwarded = headers.get("x-forwarded-for")?.trim();
  // Only explicitly trusted proxies may supply a single, overwritten client IP.
  if (trusted.has(peer) && forwarded && isIP(forwarded))
    return normalizeAddress(forwarded);
  return peer;
}

/** One active request per address, a burst of ten, then twenty starts/minute. */
export class PlaygroundAdmission {
  private clients = new Map<
    string,
    { active: boolean; tokens: number; updated: number }
  >();
  constructor(
    private readonly now = Date.now,
    private readonly maxClients = 4096,
  ) {}

  acquire(address: string): () => void {
    const now = this.now();
    let client = this.clients.get(address);
    if (!client) {
      if (this.clients.size >= this.maxClients) {
        for (const [key, entry] of this.clients) {
          if (!entry.active && now - entry.updated >= 30_000)
            this.clients.delete(key);
        }
      }
      if (this.clients.size >= this.maxClients)
        throw new RunnerError("Playground busy; retry later.", 429);
      client = { active: false, tokens: 10, updated: now };
      this.clients.set(address, client);
    }
    client.tokens = Math.min(
      10,
      client.tokens + Math.max(0, now - client.updated) / 3000,
    );
    client.updated = now;
    if (client.active)
      throw new RunnerError(
        "You already have a running job. Stop it or wait for it to finish.",
        429,
      );
    if (client.tokens < 1)
      throw new RunnerError(
        "Too many submissions; wait a few seconds before retrying.",
        429,
      );
    client.tokens--;
    client.active = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      client.active = false;
    };
  }
}

import { describe, expect, test } from "bun:test";
import {
  PlaygroundAdmission,
  clientAddress,
  trustedProxyAddresses,
} from "../playground/backend/admission";

describe("playground admission", () => {
  test("reserves one slot per client and releases it exactly once", () => {
    const admission = new PlaygroundAdmission();
    const release = admission.acquire("a");
    expect(() => admission.acquire("a")).toThrow("already have");
    admission.acquire("b")();
    release();
    const next = admission.acquire("a");
    release();
    expect(() => admission.acquire("a")).toThrow();
    next();
  });
  test("limits repeated short submissions and refills without background timers", () => {
    let now = 0;
    const admission = new PlaygroundAdmission(() => now);
    for (let i = 0; i < 10; i++) admission.acquire("a")();
    expect(() => admission.acquire("a")).toThrow("Too many");
    now = 3000;
    admission.acquire("a")();
    expect(() => admission.acquire("a")).toThrow("Too many");
    admission.acquire("b")();
  });
  test("bounds tracking memory without evicting active or throttled clients", () => {
    let now = 0;
    const admission = new PlaygroundAdmission(() => now, 2);
    const release = admission.acquire("a");
    admission.acquire("b")();
    expect(() => admission.acquire("c")).toThrow("busy");
    now = 30001;
    admission.acquire("c")();
    expect(() => admission.acquire("a")).toThrow("already have");
    release();
  });
  test("ignores spoofed forwarding headers except from explicitly trusted proxies", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    expect(clientAddress("127.0.0.1", headers, new Set())).toBe("127.0.0.1");
    const proxies = trustedProxyAddresses("127.0.0.1, ::1");
    expect(clientAddress("::ffff:127.0.0.1", headers, proxies)).toBe(
      "203.0.113.9",
    );
    headers.set("x-forwarded-for", "203.0.113.9, 127.0.0.1");
    expect(clientAddress("127.0.0.1", headers, proxies)).toBe("127.0.0.1");
    expect(() => trustedProxyAddresses("*")).toThrow();
  });
});

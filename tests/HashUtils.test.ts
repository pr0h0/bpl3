import { describe, expect, test } from "bun:test";

import { hashString } from "../compiler/common/HashUtils";

describe("HashUtils", () => {
  test("hashes strings deterministically across runtimes", () => {
    expect(hashString("")).toBe("811c9dc5");
    expect(hashString("hello")).toBe("4f9f2cab");
    expect(hashString("fn(i32)->i32")).toBe("fd78ed5d");
  });
});

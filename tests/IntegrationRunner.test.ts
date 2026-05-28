import { describe, expect, it } from "bun:test";
import { createLimiter } from "./helpers/integrationRunner";

describe("Integration runner helpers", () => {
  it("limits queued work to the requested concurrency", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 6 }, (_, index) =>
      limit(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return index;
      }),
    );

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxActive).toBe(2);
  });
});

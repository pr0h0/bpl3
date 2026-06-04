import { describe, expect, test } from "bun:test";

import { StaticTextFileCache } from "../playground/backend/staticTextFileCache";

describe("Playground static text file cache", () => {
  test("reuses cached text until mtime or size changes", () => {
    let readCount = 0;
    let fileState = {
      mtimeMs: 100,
      size: 5,
      text: "first",
    };
    const cache = new StaticTextFileCache({
      statTextFile: () => ({
        mtimeMs: fileState.mtimeMs,
        size: fileState.size,
      }),
      readTextFile: () => {
        readCount++;
        return fileState.text;
      },
    });

    expect(cache.read("/frontend/app.js")).toBe("first");
    expect(cache.read("/frontend/app.js")).toBe("first");
    expect(readCount).toBe(1);

    fileState = {
      mtimeMs: 101,
      size: 6,
      text: "second",
    };

    expect(cache.read("/frontend/app.js")).toBe("second");
    expect(readCount).toBe(2);
  });

  test("keeps independent cache entries per file path", () => {
    let readCount = 0;
    const texts: Record<string, string> = {
      "/frontend/app.js": "app",
      "/frontend/style.css": "css",
    };
    const cache = new StaticTextFileCache({
      statTextFile: (filePath) => ({
        mtimeMs: 1,
        size: texts[filePath]!.length,
      }),
      readTextFile: (filePath) => {
        readCount++;
        return texts[filePath]!;
      },
    });

    expect(cache.read("/frontend/app.js")).toBe("app");
    expect(cache.read("/frontend/style.css")).toBe("css");
    expect(cache.read("/frontend/app.js")).toBe("app");
    expect(cache.read("/frontend/style.css")).toBe("css");
    expect(readCount).toBe(2);
  });
});

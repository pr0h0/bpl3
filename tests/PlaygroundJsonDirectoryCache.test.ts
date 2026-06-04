import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

import { JsonDirectoryCache } from "../playground/backend/jsonDirectoryCache";

const SERVER_SOURCE = resolve(import.meta.dir, "../playground/backend/server.ts");

interface FakeJsonFile {
  mtimeMs: number;
  size: number;
  text: string;
}

function filePath(directoryPath: string, fileName: string): string {
  return `${directoryPath}/${fileName}`;
}

function createCacheFixture(files: Record<string, FakeJsonFile>) {
  let readCount = 0;
  const directoryPath = "/playground/examples";
  const fileNames = () => Object.keys(files).map((path) => path.split("/").at(-1)!);
  const cache = new JsonDirectoryCache({
    existsDirectory: () => true,
    readDirectory: () => fileNames(),
    statJsonFile: (path) => {
      const file = files[path];
      if (file === undefined) {
        throw new Error(`missing stat fixture for ${path}`);
      }
      return {
        mtimeMs: file.mtimeMs,
        size: file.size,
      };
    },
    readJsonFile: (path) => {
      const file = files[path];
      if (file === undefined) {
        throw new Error(`missing read fixture for ${path}`);
      }
      readCount++;
      return file.text;
    },
  });

  return {
    cache,
    directoryPath,
    readCount: () => readCount,
  };
}

describe("Playground JSON directory cache", () => {
  test("reuses parsed JSON until file metadata or directory entries change", () => {
    const files: Record<string, FakeJsonFile> = {
      [filePath("/playground/examples", "second.json")]: {
        mtimeMs: 10,
        size: 31,
        text: JSON.stringify({ order: 2, title: "second" }),
      },
      [filePath("/playground/examples", "first.json")]: {
        mtimeMs: 10,
        size: 30,
        text: JSON.stringify({ order: 1, title: "first" }),
      },
    };
    const fixture = createCacheFixture(files);

    expect(fixture.cache.read(fixture.directoryPath)).toEqual([
      { order: 1, title: "first" },
      { order: 2, title: "second" },
    ]);
    expect(fixture.cache.read(fixture.directoryPath)).toEqual([
      { order: 1, title: "first" },
      { order: 2, title: "second" },
    ]);
    expect(fixture.readCount()).toBe(2);

    files[filePath("/playground/examples", "first.json")] = {
      mtimeMs: 11,
      size: 38,
      text: JSON.stringify({ order: 1, title: "first updated" }),
    };

    expect(fixture.cache.read(fixture.directoryPath)).toEqual([
      { order: 1, title: "first updated" },
      { order: 2, title: "second" },
    ]);
    expect(fixture.readCount()).toBe(4);

    files[filePath("/playground/examples", "zero.json")] = {
      mtimeMs: 1,
      size: 29,
      text: JSON.stringify({ order: 0, title: "zero" }),
    };

    expect(fixture.cache.read(fixture.directoryPath)).toEqual([
      { order: 0, title: "zero" },
      { order: 1, title: "first updated" },
      { order: 2, title: "second" },
    ]);
    expect(fixture.readCount()).toBe(7);
  });

  test("skips malformed files while preserving cached good files", () => {
    const errors: string[] = [];
    const directoryPath = "/playground/tutorials";
    const cache = new JsonDirectoryCache({
      existsDirectory: () => true,
      readDirectory: () => ["bad.json", "good.json", "notes.txt"],
      statJsonFile: (path) => ({
        mtimeMs: path.includes("bad") ? 2 : 1,
        size: path.includes("bad") ? 12 : 31,
      }),
      readJsonFile: (path) =>
        path.includes("bad")
          ? "{ not valid"
          : JSON.stringify({ order: 1, title: "good" }),
      onFileError: (path) => errors.push(path),
    });

    expect(cache.read(directoryPath)).toEqual([{ order: 1, title: "good" }]);
    expect(errors).toEqual(["/playground/tutorials/bad.json"]);
  });

  test("server routes read playground examples and tutorials through the cache", () => {
    const serverSource = readFileSync(SERVER_SOURCE, "utf8");
    const examplesStart = serverSource.indexOf("// Get examples");
    const tutorialsStart = serverSource.indexOf("// Get tutorials");
    const compileStart = serverSource.indexOf(
      "// Compile and run BPL code",
      tutorialsStart,
    );

    expect(examplesStart).toBeGreaterThanOrEqual(0);
    expect(tutorialsStart).toBeGreaterThan(examplesStart);
    expect(compileStart).toBeGreaterThan(tutorialsStart);

    const examplesSource = serverSource.slice(examplesStart, tutorialsStart);
    const tutorialsSource = serverSource.slice(tutorialsStart, compileStart);

    expect(serverSource).toContain("JsonDirectoryCache");
    expect(examplesSource).toContain("readPlaygroundJsonDirectory(");
    expect(tutorialsSource).toContain("readPlaygroundJsonDirectory(");
    expect(examplesSource).not.toContain("fs.readFileSync(");
    expect(tutorialsSource).not.toContain("fs.readFileSync(");
    expect(examplesSource).not.toContain("JSON.parse(");
    expect(tutorialsSource).not.toContain("JSON.parse(");
  });
});

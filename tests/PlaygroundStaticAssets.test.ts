import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createContext, runInContext } from "vm";

const FRONTEND_DIR = resolve(import.meta.dir, "../playground/frontend");
const SERVER_SOURCE = resolve(
  import.meta.dir,
  "../playground/backend/server.ts",
);
const HTML_FILES = ["index.html", "tutorial.html"] as const;

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function isLocalAssetReference(value: string): boolean {
  return (
    !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
    !value.startsWith("/") &&
    !value.startsWith("#")
  );
}

function extractLocalScriptAndStyleAssets(html: string): string[] {
  const assets: string[] = [];

  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) {
    const src = match[1];
    if (src && isLocalAssetReference(src)) {
      assets.push(src);
    }
  }

  for (const match of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) {
    const href = match[1];
    if (href && isLocalAssetReference(href)) {
      assets.push(href);
    }
  }

  return sortedUnique(assets);
}

function extractServedFrontendAssets(serverSource: string): string[] {
  return sortedUnique(
    [
      ...serverSource.matchAll(
        /path\.join\(__dirname,\s*"\.\.\/frontend\/([^"]+)"/g,
      ),
    ].map((match) => match[1] ?? ""),
  );
}

describe("Playground frontend static assets", () => {
  test("tutorial loading and execution use the page origin on custom ports and remote deployments", async () => {
    const scripts = ["bplSyntax.js", "markdown.js", "tutorial.js"].map((file) =>
      readFileSync(resolve(FRONTEND_DIR, file), "utf8"),
    );
    for (const page of [
      "http://localhost:3011/tutorial.html",
      "https://play.example/tutorial.html",
    ]) {
      const calls: URL[] = [];
      const element = () => ({
        style: {},
        dataset: {},
        innerHTML: "",
        textContent: "",
        addEventListener() {},
        setAttribute() {},
        querySelectorAll: () => [],
      });
      const context = createContext({
        window: {
          location: new URL(page),
          addEventListener() {},
          history: { pushState() {}, replaceState() {} },
        },
        AbortController,
        URLSearchParams,
        URL,
        console,
        require: { config() {} },
        document: {
          title: "",
          addEventListener() {},
          querySelectorAll: () => [],
          getElementById: element,
        },
        fetch: async (url: string) => {
          const resolved = new URL(url, page);
          calls.push(resolved);
          return {
            json: async () =>
              resolved.pathname === "/tutorials"
                ? []
                : { success: true, output: "ok" },
          };
        },
      });
      for (const script of scripts) runInContext(script, context);
      expect(
        runInContext(
          "BplSyntax.monarchLanguage().symbols.test('<=>')",
          context,
        ),
      ).toBe(true);
      await runInContext("loadTutorials()", context);
      const result = await runInContext(
        'compileLesson("frame main() ret int { return 0; }")',
        context,
      );
      expect(result).toEqual({ success: true, output: "ok" });
      expect(calls.map((url) => url.href)).toEqual([
        new URL("/tutorials", page).href,
        new URL("/tutorials", page).href,
        new URL("/compile", page).href,
      ]);
    }
  });

  test("serves every local script and stylesheet referenced by frontend HTML", () => {
    const serverSource = readFileSync(SERVER_SOURCE, "utf8");
    const servedAssets = extractServedFrontendAssets(serverSource);
    const htmlAssets = sortedUnique(
      HTML_FILES.flatMap((htmlFile) =>
        extractLocalScriptAndStyleAssets(
          readFileSync(resolve(FRONTEND_DIR, htmlFile), "utf8"),
        ),
      ),
    );

    expect(htmlAssets).toEqual([
      "app.js",
      "bplSyntax.js",
      "browserWasmRuntime.js",
      "draftStore.js",
      "markdown.js",
      "style.css",
      "tutorial.js",
      "wasmHostAdapter.js",
    ]);

    for (const asset of htmlAssets) {
      expect(existsSync(resolve(FRONTEND_DIR, asset))).toBe(true);
      expect(servedAssets).toContain(asset);
      expect(serverSource).toContain(`url.pathname === "/${asset}"`);
    }
  });

  test("does not treat page-to-page links or CDN assets as backend static assets", () => {
    const html = readFileSync(resolve(FRONTEND_DIR, "index.html"), "utf8");
    const assets = extractLocalScriptAndStyleAssets(html);

    expect(assets).not.toContain("tutorial.html");
    expect(assets.some((asset) => asset.includes("cdnjs.cloudflare.com"))).toBe(
      false,
    );
  });

  test("serves frontend static text assets through the cache helper", () => {
    const serverSource = readFileSync(SERVER_SOURCE, "utf8");
    const staticStart = serverSource.indexOf("// Static files");
    const staticEnd = serverSource.indexOf(
      'return new Response("Not Found"',
      staticStart,
    );

    expect(staticStart).toBeGreaterThanOrEqual(0);
    expect(staticEnd).toBeGreaterThan(staticStart);

    const staticSource = serverSource.slice(staticStart, staticEnd);
    expect(serverSource).toContain("StaticTextFileCache");
    expect(staticSource).toContain("readStaticTextFile(");
    expect(staticSource).not.toContain("fs.readFileSync(");
  });
});

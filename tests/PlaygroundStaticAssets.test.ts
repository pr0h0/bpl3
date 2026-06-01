import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const FRONTEND_DIR = resolve(import.meta.dir, "../playground/frontend");
const SERVER_SOURCE = resolve(import.meta.dir, "../playground/backend/server.ts");
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
      "browserWasmRuntime.js",
      "style.css",
      "tutorial.css",
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
});

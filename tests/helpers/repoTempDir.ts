import { mkdirSync, mkdtempSync } from "node:fs";
import { join, resolve } from "node:path";

/** Gitignored scratch root inside the checkout. */
export const REPO_TEMP_ROOT = resolve(__dirname, "..", ".tmp");

/**
 * A fresh directory inside the checkout, for sources that must resolve the
 * repository's workspace `packages/`. All of them live under tests/.tmp, so an
 * interrupted run leaves nothing in the repository root.
 */
export function makeRepoTempDir(prefix: string): string {
  mkdirSync(REPO_TEMP_ROOT, { recursive: true });
  return mkdtempSync(join(REPO_TEMP_ROOT, prefix));
}

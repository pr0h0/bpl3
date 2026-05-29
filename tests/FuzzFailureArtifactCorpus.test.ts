import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { replayFuzzFailureArtifact } from "../fuzz/compilerFuzz";

interface StoredFailureMetadata {
  promotedTo?: string;
}

const repoRoot = resolve(import.meta.dir, "..");
const artifactDir = join(import.meta.dir, "fuzz-failure-artifacts");

function listMetadataFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...listMetadataFiles(path));
    } else if (entry.endsWith(".json")) {
      files.push(path);
    }
  }

  return files.sort();
}

describe("Fuzz failure artifact corpus", () => {
  test("saved fuzz failures still reproduce or point to a promoted regression", () => {
    for (const metadataPath of listMetadataFiles(artifactDir)) {
      const metadata = JSON.parse(
        readFileSync(metadataPath, "utf8"),
      ) as StoredFailureMetadata;

      if (metadata.promotedTo !== undefined) {
        expect(existsSync(resolve(repoRoot, metadata.promotedTo))).toBe(true);
        continue;
      }

      const replay = replayFuzzFailureArtifact({ metadataPath });
      expect(replay.failed).toBe(true);
      expect(replay.signatureMatches).toBe(true);
    }
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export function withTempBplSource<T>(
  source: string,
  callback: (sourcePath: string, tempDir: string) => T,
  prefix = "bpl-test-source-",
): T {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));
  const sourcePath = join(tempDir, "main.bpl");

  try {
    writeFileSync(sourcePath, source);
    return callback(sourcePath, tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

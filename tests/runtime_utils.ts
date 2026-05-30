import { spawnSync } from "child_process";
import * as path from "path";
import { withTempBplSource } from "./helpers/tempBplSource";

export function runBpl(
  source: string,
  testName: string,
): { stdout: string; stderr: string; exitCode: number } {
  return withTempBplSource(source, (filePath) => {
    const indexTs = path.join(process.cwd(), "index.ts");
    const result = spawnSync("bun", [indexTs, "run", filePath], {
      encoding: "utf-8",
      cwd: process.cwd(),
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? -1,
    };
  }, `bpl-${testName.replace(/\s+/g, "-")}-`);
}

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export function runBpl(
  source: string,
  testName: string,
): { stdout: string; stderr: string; exitCode: number } {
  const tempDir = path.join(
    process.platform === "win32" ? process.env.TEMP || "C:\\Temp" : "/tmp",
    "temp_tests",
  );
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const fileName = `${testName.replace(/\s+/g, "_")}.bpl`;
  const filePath = path.join(tempDir, fileName);

  fs.writeFileSync(filePath, source);

  // Run using bun index.ts
  // We assume index.ts is in the root
  const indexTs = path.join(process.cwd(), "index.ts");

  const result = spawnSync("bun", [indexTs, filePath, "--run"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.status ?? -1,
  };
}

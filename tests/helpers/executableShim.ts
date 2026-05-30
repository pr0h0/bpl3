import { chmodSync, writeFileSync } from "fs";

export function writeNodeCommandShim(
  basePath: string,
  sourceLines: string[],
): string {
  if (process.platform === "win32") {
    const scriptPath = `${basePath}.js`;
    const commandPath = `${basePath}.cmd`;
    writeFileSync(scriptPath, sourceLines.join("\n"));
    writeFileSync(
      commandPath,
      `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`,
    );
    return commandPath;
  }

  writeFileSync(basePath, ["#!/usr/bin/env node", ...sourceLines].join("\n"));
  chmodSync(basePath, 0o755);
  return basePath;
}

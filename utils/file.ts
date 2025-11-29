import { existsSync, readFileSync, writeFileSync } from "fs";
import { normalize } from "path";

export function readFile(path: string): string {
  const normalizedPath = normalize(path);
  if (!existsSync(normalizedPath)) {
    throw new Error(`File not found: ${normalizedPath}`);
  }

  return readFileSync(normalizedPath, { encoding: "utf-8" });
}

export function saveToFile(filePath: string, content: string): void {
  const normalizedPath = normalize(filePath);
  const lastSlash = normalizedPath.lastIndexOf("/");
  if (lastSlash !== -1) {
    const dir = normalizedPath.substring(0, lastSlash);
    if (!existsSync(dir)) {
      throw new Error(`Directory does not exist: ${dir}`);
    }
  }
  writeFileSync(normalizedPath, content, { encoding: "utf-8" });
}

export function getOutputFileName(
  inputFilePath: string,
  newExtension: string,
): string {
  return inputFilePath.replace(/\.[^/.]+$/, "") + newExtension;
}

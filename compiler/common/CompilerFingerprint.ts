import { createHash } from "crypto";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, relative, resolve } from "path";

/** Hash installed source in development, or the running standalone executable.
 * Paths are relative so moving an identical installation preserves its identity.
 */
export function calculateCompilerFingerprint(
  sourceRoot: string | undefined,
  executablePath: string,
): string {
  const hash = createHash("sha256");
  if (!sourceRoot) {
    return hash
      .update("executable\0")
      .update(readFileSync(executablePath))
      .digest("hex");
  }
  const sources: string[] = [];
  const collect = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) collect(file);
      else if (entry.isFile() && entry.name.endsWith(".ts")) sources.push(file);
    }
  };
  collect(join(sourceRoot, "compiler"));
  sources.push(join(sourceRoot, "grammar", "bpl.peggy"));
  const namedSources = sources.map((file) => ({
    file,
    name: relative(sourceRoot, file).split("\\").join("/"),
  }));
  namedSources.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  for (const { file, name } of namedSources) {
    hash.update(name).update("\0");
    hash.update(readFileSync(file)).update("\0");
  }
  return hash.digest("hex");
}

let fingerprint: string | undefined;
export function getCompilerFingerprint(): string {
  if (fingerprint === undefined) {
    const sourceRoot = resolve(__dirname, "../..");
    // Bun standalone executables use a virtual __dirname, without source files.
    const hasSources = existsSync(join(sourceRoot, "compiler", "index.ts"));
    fingerprint = calculateCompilerFingerprint(
      hasSources ? sourceRoot : undefined,
      process.execPath,
    );
  }
  return fingerprint;
}

import * as fs from "fs";
import * as path from "path";

/** Project mode reads only the current directory's manifest. */
export function resolveProjectEntry(
  file: string | undefined,
  project?: boolean,
): string {
  if (file && project)
    throw new Error("Use either an explicit file or --project, not both.");
  if (file) return file;
  if (!project)
    throw new Error(
      "Specify a BPL file or use --project to build the current bpl.json entry.",
    );
  const manifestPath = path.resolve("bpl.json");
  if (!fs.lstatSync(manifestPath).isFile())
    throw new Error("bpl.json must be a regular file.");
  const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest || typeof manifest !== "object")
    throw new Error("Invalid bpl.json object.");
  const data = manifest as { main?: unknown; entry?: unknown };
  const entry = data.main ?? data.entry ?? "index.bpl";
  if (
    typeof entry !== "string" ||
    !entry ||
    path.isAbsolute(entry) ||
    /^[A-Za-z]:/.test(entry) ||
    entry
      .replaceAll("\\", "/")
      .split("/")
      .some((x) => !x || x === "." || x === "..")
  )
    throw new Error("Project entry must be a package-relative file path.");
  const resolved = path.resolve(entry.replaceAll("\\", "/"));
  if (!fs.existsSync(resolved))
    throw new Error(`Project entry not found: ${entry}`);
  return resolved;
}

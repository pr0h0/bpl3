import * as fs from "fs";
import * as path from "path";

/** Compile root-relative *, ** and ? patterns without interpreting regex syntax. */
function globRegex(pattern: string): RegExp {
  let result = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*" && pattern[i + 1] === "*") {
      i++;
      if (pattern[i + 1] === "/") {
        i++;
        result += "(?:.*/)?";
      } else result += ".*";
    } else if (c === "*") result += "[^/]*";
    else if (c === "?") result += "[^/]";
    else result += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(result + "$");
}

const excludedDirectories = new Set([
  "node_modules",
  "bpl_modules",
  "build",
  "dist",
  "out",
  "vendor",
]);

/** Directory inputs are recursive, deterministic and never follow symlinks.
 * .bplignore uses root-relative glob patterns, one per line (no negation).
 * Explicit files are always included, so callers can override discovery.
 */
export function expandSourceInputs(inputs: string[]): string[] {
  const found = new Map<string, string>();
  // Existing paths are deduplicated by resolved path. A missing input keeps
  // its own spelling, so `missing/../a.bpl` still reports its error.
  const add = (file: string) =>
    found.set(
      file === "-" || !fs.existsSync(file) ? `\0${file}` : path.resolve(file),
      file,
    );
  for (const input of inputs) {
    if (
      input === "-" ||
      !fs.existsSync(input) ||
      !fs.lstatSync(input).isDirectory()
    ) {
      add(input);
      continue;
    }
    const ignoreFile = path.join(input, ".bplignore");
    const patterns = fs.existsSync(ignoreFile)
      ? fs
          .readFileSync(ignoreFile, "utf8")
          .split(/\r\n|\r|\n/)
          .map((x) => x.trim())
          .filter((x) => x && !x.startsWith("#"))
      : [];
    if (patterns.some((x) => x.startsWith("!")))
      throw new Error(".bplignore does not support negated patterns");
    const globs = patterns.map((p) =>
      globRegex(p.endsWith("/") ? `${p}**` : p),
    );
    const walk = (directory: string) => {
      for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => {
          if (a.name < b.name) return -1;
          return a.name > b.name ? 1 : 0;
        })) {
        if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
        const file = path.join(directory, entry.name);
        const relative = path.relative(input, file).split(path.sep).join("/");
        if (
          globs.some(
            (g) =>
              g.test(relative) ||
              (entry.isDirectory() && g.test(`${relative}/`)),
          )
        )
          continue;
        if (entry.isDirectory()) {
          if (!excludedDirectories.has(entry.name)) walk(file);
        } else if (entry.isFile() && /\.(bpl|x)$/.test(entry.name)) add(file);
      }
    };
    walk(input);
  }
  return [...found.values()];
}

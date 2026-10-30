/**
 * The grammar and standard library bundled into the `bpl` executable. The Bun
 * CLI registers them (cli/EmbeddedResources.ts); other hosts, such as the
 * editor extension, read an installation from disk. A `bpl` with no
 * installation beside it unpacks the library once into a cache directory
 * keyed by its content, and uses that directory as its installation root.
 */
import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";

/** Present in an unpacked installation root, written after its files. */
const EMBEDDED_HOME_MARKER = ".bpl-embedded";

/** `BPL_CACHE_DIR` when set, else `$XDG_CACHE_HOME/bpl` or `~/.cache/bpl`. */
export function getBplCacheDir(): string {
  const envCache = process.env.BPL_CACHE_DIR;
  if (envCache) {
    return resolve(envCache);
  }
  const xdgCache = process.env.XDG_CACHE_HOME;
  if (xdgCache) {
    return resolve(xdgCache, "bpl");
  }
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return resolve(homeDir, ".cache", "bpl");
}

export type EmbeddedLibFiles = ReadonlyArray<
  readonly [path: string, content: string]
>;

export interface EmbeddedResources {
  /** Text of `grammar/grammar.bpl`. */
  grammar: string;
  /** Standard library files by path relative to `lib/`, loaded on demand. */
  libFiles: () => EmbeddedLibFiles;
}

let embeddedResources: EmbeddedResources | undefined;

export function registerEmbeddedResources(resources: EmbeddedResources): void {
  embeddedResources = resources;
}

export function getEmbeddedResources(): EmbeddedResources | undefined {
  return embeddedResources;
}

let embeddedHomeKey: string | undefined;

function getEmbeddedHomeKey(files: EmbeddedLibFiles): string {
  if (embeddedHomeKey) return embeddedHomeKey;
  const hash = createHash("sha256");
  for (const [file, content] of files) {
    hash.update(file).update("\0").update(content).update("\0");
  }
  embeddedHomeKey = hash.digest("hex").slice(0, 16);
  return embeddedHomeKey;
}

/** Whether `bplHome` was unpacked from the files bundled into the compiler. */
export function isEmbeddedHome(bplHome: string): boolean {
  return existsSync(join(bplHome, EMBEDDED_HOME_MARKER));
}

/**
 * The installation root holding the bundled standard library, unpacked under
 * the BPL cache directory on first use. Concurrent first runs each stage a
 * copy and the first rename wins.
 */
export function getEmbeddedHome(): string {
  if (!embeddedResources) {
    throw new Error(
      "No BPL installation found: set BPL_HOME to a directory containing lib/errors.bpl.",
    );
  }
  const files = embeddedResources.libFiles();
  const home = join(getBplCacheDir(), "home", getEmbeddedHomeKey(files));
  if (isEmbeddedHome(home)) return home;

  mkdirSync(dirname(home), { recursive: true });
  const staging = mkdtempSync(`${home}.tmp-`);
  try {
    for (const [file, content] of files) {
      const target = join(staging, "lib", file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    writeFileSync(join(staging, EMBEDDED_HOME_MARKER), "");
    try {
      renameSync(staging, home);
    } catch (error) {
      if (!isEmbeddedHome(home)) throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return home;
}

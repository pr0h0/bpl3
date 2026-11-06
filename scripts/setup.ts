// Build BPL from this checkout and link the `bpl` command into a bin directory.
//
// Usage: bun run setup [--no-build] [--bin-dir <dir>]
//   --no-build      only refresh the link (the compiler must already be built)
//   --bin-dir <dir> where to create the `bpl` link (default: $BPL_BIN_DIR or
//                   ~/.local/bin)
//
// The compiled binary finds its checkout through the link, so no BPL_HOME
// export or shell configuration edit is needed.
import { spawnSync } from "child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from "fs";
import { homedir } from "os";
import { delimiter, join, resolve } from "path";

const root = resolve(import.meta.dir, "..");
const binary = join(root, process.platform === "win32" ? "bpl.exe" : "bpl");

function usage(): never {
  console.log(
    "Usage: bun run setup [--no-build] [--bin-dir <dir>]\n\n" +
      "Installs dependencies, builds the compiler and runtime, and links `bpl`\n" +
      "into --bin-dir (default: $BPL_BIN_DIR or ~/.local/bin).",
  );
  process.exit(0);
}

function fail(message: string): never {
  console.error(`setup: ${message}`);
  process.exit(1);
}

function run(command: string, args: string[]): void {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) fail(`${command}: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`'${[command, ...args].join(" ")}' exited with ${result.status}`);
  }
}

let build = true;
let binDir = process.env.BPL_BIN_DIR || join(homedir(), ".local", "bin");
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--no-build") build = false;
  else if (arg === "--bin-dir") {
    const value = args[++index];
    if (!value) fail("--bin-dir needs a directory");
    binDir = value;
  } else if (arg === "-h" || arg === "--help") usage();
  else fail(`unknown argument '${arg}' (see --help)`);
}
binDir = resolve(binDir);

if (build) {
  const missing = ["clang"].filter(
    (tool) => spawnSync(tool, ["--version"], { stdio: "ignore" }).error,
  );
  if (missing.length > 0) {
    fail(
      `${missing.join(", ")} not found on PATH; see docs/02-installation.md for the toolchain`,
    );
  }
  run(process.execPath, ["install", "--frozen-lockfile"]);
  run(process.execPath, ["run", "build"]);
}

if (!existsSync(binary)) {
  fail(`${binary} is missing; run without --no-build`);
}

if (process.platform === "win32") {
  console.log(`\nBuilt ${binary}. Add ${root} to PATH to use \`bpl\`.`);
  process.exit(0);
}

const link = join(binDir, "bpl");
mkdirSync(binDir, { recursive: true });
let existing: string | undefined;
try {
  existing = lstatSync(link).isSymbolicLink() ? readlinkSync(link) : "file";
} catch {
  existing = undefined;
}
if (existing === "file") {
  fail(`${link} exists and is not a symlink; remove it or pass --bin-dir`);
}
if (existing !== undefined) unlinkSync(link);
symlinkSync(binary, link);
console.log(`\nLinked ${link} -> ${binary}`);

const onPath = (process.env.PATH ?? "")
  .split(delimiter)
  .some((entry) => entry && resolve(entry) === binDir);
if (!onPath) {
  console.log(
    `\n${binDir} is not on PATH. Add this to your shell configuration:\n` +
      `    export PATH="${binDir}:$PATH"`,
  );
}

// Parse a program from outside the checkout without BPL_HOME so the check
// proves the link alone locates the grammar and standard library.
const { BPL_HOME: _ignored, ...env } = process.env;
const check = spawnSync(
  link,
  ["-e", "frame main() ret int { return 0; }", "--emit", "ast"],
  { cwd: homedir(), encoding: "utf8", env },
);
if (check.status !== 0) {
  fail(`the linked compiler failed a smoke check:\n${check.stderr}`);
}
const version = spawnSync(link, ["--version"], { encoding: "utf8", env });
console.log(`\nbpl ${version.stdout.trim()} is ready. Next: bpl doctor`);

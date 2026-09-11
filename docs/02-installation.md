# Installation

## Requirements and platform scope

Building from source requires **Bun**, Git, a Clang-compatible C compiler, and
Bash for the runtime build script. Node.js alone cannot run this compiler: the CLI
uses Bun APIs. The compiled `bpl` executable includes the Bun runtime, but still
needs the installation's grammar, standard library, and runtime files.

Native runtime builds support Linux and macOS. The configured CI matrix tests
Ubuntu system Clang and Clang 18, and macOS Apple Clang and Homebrew LLVM.
Windows CI exercises parser, typechecker, and code-generation components; it does
not establish native runtime support. Use WSL and the Linux workflow on Windows.
See [the workflow](../.github/workflows/compiler-correctness.yml) for the actual
matrix. There is no independently verified minimum LLVM version guarantee.

On Ubuntu/Debian, install the native tools with:

```bash
sudo apt-get update
sudo apt-get install git clang llvm lld
```

On macOS, install Xcode Command Line Tools (`xcode-select --install`) or a
Clang toolchain through Homebrew (`brew install llvm lld`). Ensure the intended
compiler is on `PATH`. Install Bun using its [installation instructions](https://bun.sh).
`wasm-ld` is needed for WebAssembly linking; native-only builds do not need it.

## Build from source

From a Linux or macOS shell:

```bash
git clone https://github.com/pr0h0/bpl3.git
cd bpl3
bun install --frozen-lockfile
bun run build
export BPL_HOME="$PWD"
export PATH="$BPL_HOME:$PATH"
bpl --version
bpl doctor
```

Keep the cloned directory: moving only the executable does not install its
support files. Persist the two exports in your shell configuration using the
actual installation path. `BPL_HOME` must identify a real installation directory,
without symlinked parent components. `bpl doctor` checks the selected environment.

The legacy `./init.sh` helper builds the compiler, installs a link in `/usr/bin`
with `sudo`, and edits `~/.bashrc`. It uses Linux/GNU utilities and is not the
portable installation workflow.

## Verify compilation

<!-- bpl-doc: run=installation -->

```bpl
import printf from "std/c.bpl";

frame main() ret int {
    printf("BPL is working!\n");
    return 0;
}
```

Save this as `hello.bpl`, then run:

```bash
bpl run hello.bpl
```

Expected program output: `BPL is working!`.

## VS Code

From the repository root, build and package the extension:

```bash
cd vscode-ext
npm install
npm run compile
npx @vscode/vsce package
code --install-extension bpl3-vscode-*.vsix
```

These packaging steps require Node/npm and the VS Code `code` command. See the
[extension README](../vscode-ext/README.md) for configuration and development.
Other editors can use custom syntax definitions; this repository does not
provide equivalent tested integrations for each editor.

## Troubleshooting

- **`bpl` is not found:** check that the directory containing `bpl` is on `PATH`.
  Setting `BPL_HOME` alone does not add it to `PATH`.
- **Clang cannot be found or rejects LLVM IR:** inspect `clang --version`, run
  `bpl doctor`, and compare your toolchain with the CI matrix above. Capture the
  compiler diagnostic and a minimal input when reporting a failure.
- **Missing grammar, library, or runtime:** check `BPL_HOME` and rebuild with
  `bun run build`. Do not point it at a directory containing only a copied binary.
- **Foreign-target link failure:** a target triple does not install a linker,
  sysroot, C library, or target runtime. See [cross-compilation](37-cross-compilation.md).

## Updating and uninstalling

After updating the checkout, rerun `bun install --frozen-lockfile` and
`bun run build`. Reinstall the extension separately if its sources changed.

To uninstall the PATH-based installation, remove the exports you added to your
shell configuration, then remove the checkout when you no longer need its files.
If you used `init.sh`, also remove its `/usr/bin/bpl` link and `BPL_HOME` shell entry.

## Release validation

Before publishing a build, use the repository's release checks:

```bash
bun run release:check
bun run release:manifest
```

The check script validates TypeScript, CLI registry synchronization, release
metadata, packaged CLI/runtime smoke tests, and extension tests. The manifest
command writes `dist/release-manifest.json` with artifact hashes. See
[package.json](../package.json) for the authoritative script definitions.

Continue with the [quick start](03-quick-start.md).

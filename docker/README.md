# Compiler and playground containers

Two targets share the compiler/toolchain layers:

- `compiler`: the BPL CLI, standard library, bundled package sources/archives,
  Clang 18/LLD with sanitizer runtimes, and native SQLite/libsodium/OpenSSL/zlib libraries. It has no web
  server or Docker client. The entrypoint is `bpl`; the default command is help.
- `playground`: the compiler plus the web UI, examples/tutorials, Docker CLI,
  controller and worker entrypoint. Each job runs in a separate disposable
  container with the existing resource/filesystem/network restrictions.

These images are prepared locally; adding this workflow does not publish them.
The initial tested platform is Linux amd64. No multi-platform manifest is promised.

## Build locally

From the checkout root:

```sh
docker build -f docker/Dockerfile --target compiler -t bpl-compiler:local .
docker build -f docker/Dockerfile --target playground -t bpl-playground:local .
```

The image version must match package.json and remain `0.1.x`. A maintainer-approved
patch bump must also update the Dockerfile's default BPL_VERSION; CI supplies
that version explicitly. No minor/major bump or automatic version bump is made.

## Compile and run your code

The following commands use a POSIX shell on Linux. Run as your own UID/GID so
output files retain your ownership. The examples assume main.bpl in the current
directory; arguments after the image name are BPL CLI arguments.

```sh
# Compile and execute inside the container.
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" bpl-compiler:local run main.bpl

# Keep sources read-only and export a binary to ./out.
mkdir -p out
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD:/work:ro" -v "$PWD/out:/out" \
  bpl-compiler:local build main.bpl -O 3 -o /out/app

# Execute that artifact in the container.
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/out:/out:ro" --entrypoint /out/app bpl-compiler:local

# Or execute it on a compatible Linux host.
./out/app
```

The output targets the image's CPU architecture and Linux ABI. Running outside
Docker requires matching architecture and a compatible loader/libc and linked
libraries. A Linux binary does not become a native macOS or Windows executable.
A glibc binary built on Ubuntu 24.04 may need a newer libc than an older Linux
host provides. Run it in the image when the host does not match. Cross-compiling
requires the appropriate target toolchain/sysroot; these images do not include
Go, Rust, .NET or other language SDKs.

Native library linker flags work normally. For example, after installing the
bundled SQLite package, use `--clang-flag=-l:libsqlite3.so.0`. Auth also needs
`--clang-flag=-l:libsodium.so.23`. OpenSSL and optional gzip load on use.

```sh
# Install an included package into your mounted writable project.
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" \
  bpl-compiler:local install /opt/bpl/packages/bpl-auth/bpl-auth-0.1.0.tgz
```

## Start the playground

On a Linux host using /var/run/docker.sock:

```sh
docker run --rm --name bpl-playground \
  -p 127.0.0.1:3001:3001 \
  --group-add "$(stat -c '%g' /var/run/docker.sock)" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  bpl-playground:local
```

Open http://127.0.0.1:3001. The controller needs access to the host Docker daemon
so it can create fresh workers; workers receive no Docker socket or host bind
mount. Treat the controller and its Docker access as trusted administration.
The suggested port binding keeps the UI local. Do not switch to host runner mode
to avoid configuring Docker access. Rootless Docker/custom socket locations need
the corresponding host socket mounted at /var/run/docker.sock with its group
added. macOS uses `stat -f '%g'` rather than GNU stat's `-c` option.

If you choose a different image tag or digest, set BPL_PLAYGROUND_IMAGE to that
same local image reference. BPL_PLAYGROUND_WORKER_ENTRYPOINT selects the worker
entrypoint; it is already set in the playground image. The legacy
playground/Dockerfile remains the dedicated worker used by bun run playground:build.
The new compiler image does not need Docker daemon access to compile or run.
HOME and temporary compiler caches live under /tmp so arbitrary caller UIDs can
use the CLI without writing to the installed toolchain.

## GitHub Container Registry

The Container images workflow builds and tests both targets on pushes/PRs.
Publication uses an artifact containing the exact images that passed CI, rather
than rebuilding untested copies. It requires a maintainer to run workflow_dispatch
with publish=true;
the default is false. It does not create Git tags, GitHub releases or npm
publications, and refuses to overwrite an existing version tag. A retry at the
same commit skips already published images so a partial upload can be completed. Only 0.1.x
versions are accepted. Future publications require maintainer instructions.

After initial publication, the intended names are:

- ghcr.io/pr0h0/bpl3-compiler:0.1.1
- ghcr.io/pr0h0/bpl3-playground:0.1.1

Substitute these references for the local tags in the commands above. The
published playground image is built with its own versioned image reference for
workers. GitHub package visibility/access must permit the intended users to
pull the image; verify that during the initial publication. No floating latest
or stable tag is published.

## Validate

```sh
BPL_TEST_COMPILER_DOCKER=1 bun test tests/CompilerDocker.test.ts
BPL_TEST_DOCKER=1 BPL_PLAYGROUND_IMAGE=bpl-playground:local \
  BPL_PLAYGROUND_WORKER_ENTRYPOINT=/usr/local/bin/bpl-playground-worker \
  bun test tests/PlaygroundDocker.test.ts
```

CompilerDocker checks read-only mounted sources, output ownership, container and
host execution, bundled SQLite/auth installation and linking, and the web UI's
compile endpoint. Existing playground worker tests exercise the disposable job
lifecycle. Use BPL_COMPILER_IMAGE and BPL_CONTAINER_PLAYGROUND_IMAGE to test
alternate local tags; set BPL_DOCKER_SOCKET for a nondefault host socket in tests.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function runInteropMatrix(
  options: { docker?: boolean; log?: (line: string) => void } = {},
): string[] {
  const fixtures = resolve(import.meta.dir, "../fixtures/interop");
  const dir = mkdtempSync(join(tmpdir(), "bpl-interop-"));
  const passed: string[] = [];
  function run(
    command: string,
    args: string[],
    env?: NodeJS.ProcessEnv,
  ): string {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 180000,
      env: { ...process.env, ...env },
    });
    if (result.status !== 0)
      throw new Error(
        `${command} ${args.join(" ")}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`,
      );
    return result.stdout;
  }
  function check(label: string, output: string) {
    if (output.trim() !== "interop-ok") throw new Error(`${label}: ${output}`);
    passed.push(label);
    options.log?.(`PASS ${label}`);
  }
  const cc = process.env.CC || "clang";
  const cxx = process.env.CXX || "clang++";
  const docker = (image: string, command: string[]) =>
    run("docker", [
      "run",
      "--rm",
      "--network=none",
      "--user",
      `${process.getuid!()}:${process.getgid!()}`,
      "-v",
      `${dir}:/work`,
      "-v",
      `${fixtures}:/fixtures:ro`,
      "-w",
      "/work",
      "-e",
      "GOCACHE=/tmp/go-cache",
      "-e",
      "GOPATH=/tmp/go",
      "-e",
      "CGO_ENABLED=1",
      "-e",
      "CGO_CFLAGS=-I/fixtures",
      "-e",
      "CGO_LDFLAGS=-L/work -lbpl_interop",
      "-e",
      "LD_LIBRARY_PATH=/work",
      image,
      ...command,
    ]);
  try {
    for (const opt of [0, 3]) {
      const source = join(fixtures, "library.bpl");
      const shared = join(dir, "libbpl_interop.so");
      run("bun", [
        resolve("index.ts"),
        "build",
        source,
        "--shared",
        "-O",
        String(opt),
        "-o",
        shared,
      ]);
      for (const [language, compiler] of [
        ["C", cc],
        ["C++", cxx],
      ]) {
        const host = join(dir, "host");
        run(compiler!, [
          "-x",
          language === "C" ? "c" : "c++",
          join(fixtures, "host.c"),
          "-L",
          dir,
          "-lbpl_interop",
          `-Wl,-rpath,${dir}`,
          "-o",
          host,
        ]);
        check(`${language}->BPL->${language} O${opt}`, run(host, []));
        const provider = join(dir, "provider.o");
        run(compiler!, [
          "-x",
          language === "C" ? "c" : "c++",
          "-c",
          "-O2",
          join(fixtures, "provider.c"),
          "-o",
          provider,
        ]);
        const binary = join(dir, "outbound");
        run("bun", [
          resolve("index.ts"),
          "build",
          join(fixtures, "outbound.bpl"),
          "-O",
          String(opt),
          "--object",
          provider,
          "-o",
          binary,
        ]);
        check(`BPL->${language}->BPL O${opt}`, run(binary, []));
      }
      check(
        `Python->BPL->Python O${opt}`,
        run("python3", [join(fixtures, "host.py"), shared]),
      );
      check(
        `JavaScript(Bun)->BPL->JavaScript O${opt}`,
        run("bun", [join(fixtures, "host.js"), shared]),
      );
      if (options.docker) {
        docker("rust:1-bookworm", [
          "rustc",
          "--edition=2021",
          "/fixtures/host.rs",
          "-L",
          "/work",
          "-o",
          "/work/rust-host",
        ]);
        check(
          `Rust->BPL->Rust O${opt}`,
          docker("rust:1-bookworm", ["/work/rust-host"]),
        );
        docker("rust:1-bookworm", [
          "rustc",
          "--edition=2021",
          "--crate-type=cdylib",
          "/fixtures/provider.rs",
          "-o",
          "/work/libforeign_rust.so",
        ]);
        docker("golang:1-bookworm", [
          "go",
          "build",
          "-o",
          "/work/go-host",
          "/fixtures/host.go",
        ]);
        check(
          `Go->BPL->Go O${opt}`,
          docker("golang:1-bookworm", ["/work/go-host"]),
        );
        docker("golang:1-bookworm", [
          "go",
          "build",
          "-buildmode=c-shared",
          "-o",
          "/work/libforeign_go.so",
          "/fixtures/provider.go",
        ]);
        for (const language of ["rust", "go"]) {
          const binary = join(dir, `outbound-${language}`);
          run("bun", [
            resolve("index.ts"),
            "build",
            join(fixtures, "outbound.bpl"),
            "-O",
            String(opt),
            "-L",
            dir,
            "-l",
            `foreign_${language}`,
            `--clang-flag=-Wl,-rpath,${dir}`,
            "-o",
            binary,
          ]);
          check(`BPL->${language}->BPL O${opt}`, run(binary, []));
        }
      }
    }
    return passed;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

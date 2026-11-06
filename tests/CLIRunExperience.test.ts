import { describe, expect, test } from "bun:test";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const CLI = resolve("index.ts");

function runCli(
  args: string[],
  cwd: string,
  env: Record<string, string | undefined> = {},
) {
  const result = Bun.spawnSync([process.execPath, CLI, ...args], {
    cwd,
    env: { ...process.env, ...env },
    timeout: 60000,
  });
  return {
    status: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function withProject(run: (directory: string, temp: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "bpl-run-experience-"));
  const directory = join(root, "project");
  const temp = join(root, "tmp");
  mkdirSync(directory);
  mkdirSync(temp);
  try {
    run(directory, temp);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const ARGS_PROGRAM = `import printf from "std/c.bpl";
frame main(argc: int, argv: *string) ret int {
    local i: int = 1;
    loop (i < argc) {
        printf("[%s]", argv[i]);
        i = i + 1;
    }
    printf("\\n");
    return 7;
}
`;

describe("bpl run developer experience", () => {
  test("leaves no artifacts beside the source and forwards the exit code", () => {
    withProject((directory, temp) => {
      writeFileSync(join(directory, "main.bpl"), ARGS_PROGRAM);
      const result = runCli(
        ["run", "main.bpl", "a", "--", "--flag"],
        directory,
        { TMPDIR: temp },
      );
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("[a][--flag]\n");
      expect(result.status).toBe(7);
      expect(readdirSync(directory)).toEqual(["main.bpl"]);
      expect(readdirSync(temp)).toEqual([]);
    });
  });

  test("runs the bpl.json entry when no file is given", () => {
    withProject((directory) => {
      writeFileSync(join(directory, "app.bpl"), ARGS_PROGRAM);
      writeFileSync(
        join(directory, "bpl.json"),
        JSON.stringify({ name: "demo", version: "0.1.0", main: "app.bpl" }),
      );
      const result = runCli(["run", "--", "x"], directory);
      expect(result.stdout).toBe("[x]\n");
      expect(result.status).toBe(7);

      const build = runCli(["build", "-o", "out"], directory);
      expect(build.stderr).toBe("");
      expect(build.status).toBe(0);
      expect(readdirSync(directory)).toContain("out");

      const outside = runCli(["run"], join(directory, ".."), {
        NO_COLOR: "1",
      });
      expect(outside.status).toBe(1);
      expect(outside.stderr).toContain("Specify a BPL file");
    });
  });

  test("project build errors are structured and never overwrite the source", () => {
    withProject((directory) => {
      writeFileSync(
        join(directory, "app"),
        "frame main() ret int { return 0; }\n",
      );
      writeFileSync(
        join(directory, "bpl.json"),
        JSON.stringify({ name: "demo", version: "0.1.0", main: "app" }),
      );
      const collision = runCli(["build", "--json"], directory);
      expect(collision.status).toBe(1);
      expect(JSON.parse(collision.stdout).errorCode).toBe(
        "BPL_BUILD_OUTPUT_IS_SOURCE",
      );
      expect(readdirSync(directory).sort()).toEqual(["app", "bpl.json"]);

      writeFileSync(join(directory, "bpl.json"), "{");
      const malformed = runCli(["build", "--json"], directory);
      expect(malformed.status).toBe(1);
      const report = JSON.parse(malformed.stdout);
      expect(report.errorCode).toBe("BPL_BUILD_PROJECT_ENTRY_INVALID");
      expect(report.error).toContain("Invalid bpl.json");
    });
  });

  test("refuses an output that is a link to the source", () => {
    withProject((directory) => {
      const source = "frame main() ret int { return 0; }\n";
      writeFileSync(join(directory, "main.bpl"), source);
      linkSync(join(directory, "main.bpl"), join(directory, "hard"));
      symlinkSync("main.bpl", join(directory, "soft"));
      const cases: [string, string][] = [
        ["hard", "BPL_BUILD_OUTPUT_IS_SOURCE"],
        ["soft", "BPL_BUILD_OUTPUT_SYMLINK"],
      ];
      for (const [output, code] of cases) {
        const result = runCli(
          ["build", "main.bpl", "-o", output, "--json"],
          directory,
        );
        expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout).errorCode).toBe(code);
      }
      expect(readFileSync(join(directory, "main.bpl"), "utf8")).toBe(source);
    });
  });

  test("keeps the executable when -o is given", () => {
    withProject((directory) => {
      writeFileSync(join(directory, "main.bpl"), ARGS_PROGRAM);
      const result = runCli(["run", "main.bpl", "-o", "app"], directory);
      expect(result.status).toBe(7);
      expect(readdirSync(directory).sort()).toEqual([
        "app",
        "app.ll",
        "main.bpl",
      ]);
    });
  });
});

describe("CLI error reporting", () => {
  test("suggests a command for a mistyped command name", () => {
    withProject((directory) => {
      const result = runCli(["chek"], directory, { NO_COLOR: "1" });
      expect(result.status).toBe(1);
      expect(result.stderr).toBe(
        "error: Unknown command 'chek'. Did you mean 'check'? Run 'bpl --help' for the command list.\n",
      );
    });
  });

  test("small diagnostics point at real locations and inputs (BUG-443)", () => {
    withProject((directory) => {
      const env = { NO_COLOR: "1" };
      writeFileSync(join(directory, "lib.bpl"), "frame helper() {}\n");
      const noMain = runCli(["build", "lib.bpl"], directory, env);
      expect(noMain.stderr).toContain(
        "error[lib.bpl:1:1]: Missing entry point function 'main'",
      );

      writeFileSync(join(directory, "bad.bpl"), "frame main( {\n");
      const badFormat = runCli(["format", "bad.bpl"], directory, env);
      expect(badFormat.status).toBe(1);
      expect(badFormat.stderr).toContain("error[bad.bpl:1:1]");

      const stdin = Bun.spawnSync(
        [process.execPath, CLI, "format", "--check", "-"],
        {
          cwd: directory,
          env: { ...process.env, ...env },
          stdin: new TextEncoder().encode("frame main() ret int {return 0;}\n"),
        },
      );
      expect(stdin.stderr.toString()).toContain(
        "error: <stdin> is not formatted",
      );

      const doctor = JSON.parse(runCli(["doctor", "--json"], directory).stdout);
      expect(doctor.bplHomeSource).toBeString();

      const help = runCli(["run", "--help"], directory).stdout;
      for (const option of [
        "--lib",
        "--lib-path",
        "--object",
        "--clang-flag",
      ]) {
        expect(help).toContain(option);
      }
    });
  });

  test("check accepts prelude error types and pipes uncolored output", () => {
    withProject((directory) => {
      writeFileSync(
        join(directory, "main.bpl"),
        `frame main() ret int {
    try {
        local p: *int = nullptr;
        local _v: int = *p;
    } catch (_e: NullAccessError) {
        return 1;
    }
    return missing;
}
`,
      );
      const env = { NO_COLOR: undefined, FORCE_COLOR: undefined };
      const result = runCli(["check", "main.bpl"], directory, env);
      expect(result.status).toBe(1);
      expect(result.stderr).not.toContain("Undefined type");
      expect(result.stderr).toContain("Undefined symbol 'missing'");
      expect(result.stderr).not.toContain("\u001b[");
    });
  });
});

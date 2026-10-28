import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "fs";
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

      const outside = runCli(["run"], join(directory, ".."), {
        NO_COLOR: "1",
      });
      expect(outside.status).toBe(1);
      expect(outside.stderr).toContain("Specify a BPL file");
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

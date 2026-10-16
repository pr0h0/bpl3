import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

test("dev --no-run compiles without executing while dev executes by default", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-dev-run-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(
      file,
      'extern puts(text:string)ret int;frame main()ret int{puts("DEV_PROGRAM_EXECUTED");return 0;}',
    );
    for (const extra of [["--no-run"], []]) {
      const child = spawn("bun", [resolve("index.ts"), "dev", file, ...extra], {
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      try {
        await new Promise<void>((ready, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Watch did not become ready: " + output)),
            25000,
          );
          const receive = (data: Buffer) => {
            output += data.toString();
            if (output.includes("Watching for changes...")) {
              clearTimeout(timeout);
              ready();
            }
          };
          child.stdout.on("data", receive);
          child.stderr.on("data", receive);
          child.once("error", (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once("exit", (code) => {
            clearTimeout(timeout);
            reject(new Error(`Dev exited with ${code}: ${output}`));
          });
        });
        expect(output).toContain("Compilation successful");
        expect(output.includes("DEV_PROGRAM_EXECUTED")).toBe(
          extra.length === 0,
        );
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGTERM");
          await exited;
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("dev survives failed programs and native links, then runs corrected source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-dev-recovery-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, "frame main() ret int { return 7; }");
    const child = spawn("bun", [resolve("index.ts"), "dev", file], {
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const receive = (data: Buffer) => {
      output += data.toString();
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    const waitFor = async (text: string) => {
      const deadline = Date.now() + 30000;
      while (!output.includes(text)) {
        if (
          child.exitCode !== null ||
          child.signalCode !== null ||
          Date.now() > deadline
        ) {
          throw new Error(
            `Dev stopped or timed out waiting for ${text}: ${output}`,
          );
        }
        await new Promise((done) => setTimeout(done, 25));
      }
    };
    try {
      await waitFor("Watching for changes...");
      expect(output).toContain("Program exited with code 7");
      output = "";
      writeFileSync(
        file,
        "extern bpl_missing_watch_symbol(); frame main() { bpl_missing_watch_symbol(); }",
      );
      await waitFor("Failed to compile LLVM IR");
      await waitFor("Compilation failed");
      output = "";
      writeFileSync(
        file,
        'extern puts(text:string)ret int;frame main(){puts("DEV_RECOVERED");}',
      );
      await waitFor("DEV_RECOVERED");
      await waitFor("Compilation successful");
      expect(child.exitCode).toBeNull();
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

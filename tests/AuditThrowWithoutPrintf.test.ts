import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";
test("string throws compile without importing printf", () => {
  for (const opt of [0, 3] as const) {
    expect(
      runBplAtOptimization(
        'frame main() ret int { try { throw "problem"; } catch (message:string) { return 0; } return 2; }',
        opt,
      ),
    ).toMatchObject({ exitCode: 0, stdout: "", stderr: "" });
    expect(
      runBplAtOptimization(
        'frame main() ret int { throw "problem"; }',
        opt,
      ),
    ).toMatchObject({
      exitCode: 1,
      stdout: "",
      stderr: "Uncaught exception\n",
    });
  }
}, 60000);

import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

test("process APIs return application exit codes and retain captured output", () => {
  const cases = [0, 1, 3, 42, 127, 255];
  const statements = cases
    .map(
      (code) => `
    if(execStatus("sh", "-c", "exit ${code}")!=${code}){return 1;}
    if(execSilent("sh", "-c", "exit ${code}")!=${code}){return 2;}
    local shell${code}:ProcessResult=execShell("printf captured; exit ${code}");
    if(shell${code}.exitCode!=${code} || strcmp(shell${code}.output.data,"captured")!=0){return 3;}
    shell${code}.output.destroy();
    local output${code}:ProcessResult=execOutput("sh", "-c", "printf captured; exit ${code}");
    if(output${code}.exitCode!=${code} || strcmp(output${code}.output.data,"captured")!=0){return 4;}
    output${code}.output.destroy();
  `,
    )
    .join("\n");
  const source = `
    import execStatus, execSilent, execShell, execOutput, [ProcessResult] from "std/process.bpl";
    extern strcmp(a:string,b:string)ret int;
    frame main()ret int {
      ${statements}
      local killed:ProcessResult=execShell("kill -TERM $$");
      local ok:bool=killed.exitCode==143;killed.output.destroy();
      if(!ok){return 5;}return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
  }
}, 60000);

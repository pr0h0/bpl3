/**
 * Doctor Command Registrar
 * Keeps action-only toolchain diagnostics out of CLI help startup.
 */

import type { Command } from "commander";

export {
  DOCTOR_SCOPE_UNKNOWN_CODE,
  WASM_LINKER_UNAVAILABLE_CODE,
} from "./DoctorContracts";

export function registerDoctorCommand(program: Command, version: string): void {
  program
    .command("doctor [scope]")
    .description("Check local BPL toolchain and runtime setup")
    .option("--json", "output machine-readable diagnostics")
    .action(
      async (
        scope: string | undefined,
        options: { json?: boolean },
        command: Command,
      ) => {
        const globalOpts = command.parent?.opts() || {};
        const outputJson = Boolean(options.json || globalOpts.json);
        const { runDoctorCommand } = await import("./doctorAction");
        await runDoctorCommand(scope, outputJson, version);
      },
    );
}

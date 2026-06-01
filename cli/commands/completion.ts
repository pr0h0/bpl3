/**
 * Completion Command Handler
 * Generates shell completion scripts for bash and zsh
 */

import * as fs from "fs";
import { Command } from "commander";
import { resolveBplPath } from "../../compiler";
import {
  getBashCompletionScript,
  getZshCompletionScript,
} from "../completions";
import { Logger } from "../../compiler/common/Logger";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";

const log = new Logger("Completion");
export const COMPLETION_SHELL_UNSUPPORTED_CODE =
  "BPL_COMPLETION_SHELL_UNSUPPORTED";

/**
 * Register the completion command
 */
export function registerCompletionCommand(program: Command): void {
  program
    .command("completion [shell]")
    .description("Generate shell completion script (bash or zsh)")
    .option("--json", "output a machine-readable completion report")
    .action(
      (
        shell: string | undefined,
        options: { json?: boolean },
        command: Command,
      ) => {
        const targetShell = shell || "bash";
        const globalOpts = command.optsWithGlobals();
        const outputJson = Boolean(options.json || globalOpts.json);
        try {
          if (targetShell !== "bash" && targetShell !== "zsh") {
            if (outputJson) {
              console.log(
                JSON.stringify(
                  createJsonReport(CLI_JSON_CHECKS.completion, false, {
                    shell: targetShell,
                    error: "Unsupported shell. Use 'bash' or 'zsh'.",
                    errorCode: COMPLETION_SHELL_UNSUPPORTED_CODE,
                  }),
                  null,
                  2,
                ),
              );
              process.exit(1);
            }
            log.error("Unsupported shell. Use 'bash' or 'zsh'.");
            process.exit(1);
          }

          // Try to read from file first using BPL_HOME
          const completionFile =
            targetShell === "bash"
              ? resolveBplPath("completions", "bpl-completion.bash")
              : resolveBplPath("completions", "_bpl");

          let content: string;

          if (fs.existsSync(completionFile)) {
            content = fs.readFileSync(completionFile, "utf-8");
          } else {
            // Use embedded completion scripts for compiled binary
            content =
              targetShell === "bash"
                ? getBashCompletionScript()
                : getZshCompletionScript();
          }

          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.completion, true, {
                  shell: targetShell,
                  script: content,
                }),
                null,
                2,
              ),
            );
            return;
          }

          console.log(content);
        } catch (e) {
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.completion, false, {
                  shell: targetShell,
                  error: e instanceof Error ? e.message : String(e),
                }),
                null,
                2,
              ),
            );
            process.exit(1);
          }
          log.error(`${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
      },
    );
}

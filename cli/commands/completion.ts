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

const log = new Logger("Completion");

/**
 * Register the completion command
 */
export function registerCompletionCommand(program: Command): void {
  program
    .command("completion [shell]")
    .description("Generate shell completion script (bash or zsh)")
    .action((shell: string | undefined) => {
      try {
        const targetShell = shell || "bash";

        if (targetShell !== "bash" && targetShell !== "zsh") {
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

        console.log(content);
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });
}

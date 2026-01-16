/**
 * Run Script Command Handler
 * Executes scripts defined in bpl.json
 */

import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("RunScript");

export function registerRunScriptCommand(program: Command): void {
  program
    .command("run-script")
    .alias("rs")
    .argument("<script>", "Script name from bpl.json")
    .argument("[args...]", "Arguments to pass to the script")
    .description("Run a script defined in bpl.json")
    .action((scriptName: string, args: string[]) => {
      const manifestPath = path.join(process.cwd(), "bpl.json");

      if (!fs.existsSync(manifestPath)) {
        log.error("No bpl.json found in current directory.");
        process.exit(1);
      }

      let manifest: any;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      } catch (_e) {
        log.error("Failed to parse bpl.json");
        process.exit(1);
      }

      if (!manifest.scripts || !manifest.scripts[scriptName]) {
        log.error(`Script '${scriptName}' not found in bpl.json`);
        if (manifest.scripts) {
          log.info("Available scripts:");
          Object.keys(manifest.scripts).forEach((s) => log.info(`  - ${s}`));
        }
        process.exit(1);
      }

      const command = manifest.scripts[scriptName];
      // Append extra args if any
      const FullCommand =
        args.length > 0 ? `${command} ${args.join(" ")}` : command;

      log.info(`> ${FullCommand}`);

      // Setup Environment with PATH
      const localBin = path.join(process.cwd(), "bpl_modules", ".bin");
      const globalBin = path.join(os.homedir(), ".bpl", "bin");
      const nodeBin = path.join(process.cwd(), "node_modules", ".bin");

      const PATH = `${localBin}${path.delimiter}${globalBin}${path.delimiter}${nodeBin}${path.delimiter}${process.env.PATH}`;

      const env = { ...process.env, PATH };

      const result = spawnSync(FullCommand, {
        shell: true,
        stdio: "inherit",
        env,
      });

      if (result.status !== 0) {
        process.exit(result.status || 1);
      }
    });
}

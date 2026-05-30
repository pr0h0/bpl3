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

interface PackageScript {
  name: string;
  command: string;
}

interface RunScriptOptions {
  list?: boolean;
  json?: boolean;
}

export function registerRunScriptCommand(program: Command): void {
  program
    .command("run-script")
    .alias("rs")
    .argument("[script]", "Script name from bpl.json")
    .argument("[args...]", "Arguments to pass to the script")
    .description("Run a script defined in bpl.json")
    .option("--list", "list scripts without executing one")
    .option("--json", "output machine-readable script list")
    .action(
      (
        scriptName: string | undefined,
        args: string[],
        rawOptions: RunScriptOptions,
        cliCommand: Command,
      ) => {
        const inheritedOptions =
          typeof cliCommand.optsWithGlobals === "function"
            ? cliCommand.optsWithGlobals()
            : {};
        const options = {
          ...inheritedOptions,
          ...rawOptions,
          json: Boolean(rawOptions.json || inheritedOptions.json),
          list: Boolean(rawOptions.list),
        };
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

        const scripts = getPackageScripts(manifest);

        if (options.list || !scriptName) {
          printScriptList(scripts, Boolean(options.json));
          return;
        }

        const script = scripts.find((entry) => entry.name === scriptName);

        if (!script) {
          log.error(`Script '${scriptName}' not found in bpl.json`);
          if (scripts.length > 0) {
            printScriptList(scripts, false);
          }
          process.exit(1);
        }

        const scriptCommand = script.command;

        // Append extra args if any
        const fullCommand =
          args.length > 0
            ? `${scriptCommand} ${args.map(quoteShellArg).join(" ")}`
            : scriptCommand;

        log.info(`> ${fullCommand}`);

        // Setup Environment with PATH
        const localBin = path.join(process.cwd(), "bpl_modules", ".bin");
        const globalBin = path.join(os.homedir(), ".bpl", "bin");
        const nodeBin = path.join(process.cwd(), "node_modules", ".bin");

        const PATH = `${localBin}${path.delimiter}${globalBin}${path.delimiter}${nodeBin}${path.delimiter}${process.env.PATH}`;

        const env = { ...process.env, PATH };

        const result = spawnSync(fullCommand, {
          shell: true,
          stdio: "inherit",
          env,
        });

        if (result.status !== 0) {
          process.exit(result.status || 1);
        }
      },
    );
}

function quoteShellArg(arg: string): string {
  if (arg.length === 0) {
    return process.platform === "win32" ? '""' : "''";
  }

  if (process.platform === "win32") {
    return `"${arg.replace(/(["^&|<>%])/g, "^$1")}"`;
  }

  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function getPackageScripts(manifest: any): PackageScript[] {
  if (!manifest.scripts) {
    return [];
  }

  if (typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts)) {
    log.error("'scripts' in bpl.json must be an object");
    process.exit(1);
  }

  return Object.entries(manifest.scripts).map(([name, command]) => {
    if (name.length === 0) {
      log.error("'scripts' entries must use non-empty script names");
      process.exit(1);
    }

    if (typeof command !== "string" || command.trim().length === 0) {
      log.error(`Script '${name}' in bpl.json must be a non-empty string`);
      process.exit(1);
    }

    return { name, command };
  });
}

function printScriptList(scripts: PackageScript[], outputJson: boolean): void {
  if (outputJson) {
    console.log(JSON.stringify({ scripts }, null, 2));
    return;
  }

  if (scripts.length === 0) {
    log.info("No scripts defined in bpl.json");
    return;
  }

  log.info("Available scripts:");
  for (const script of scripts) {
    log.info(`  - ${script.name}: ${script.command}`);
  }
}

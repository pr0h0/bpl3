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
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import { findSymlinkedParentPath } from "../../compiler/common/PathSafety";

const log = new Logger("RunScript");

export const RUN_SCRIPT_MANIFEST_NOT_FOUND_CODE =
  "BPL_RUN_SCRIPT_MANIFEST_NOT_FOUND";
export const RUN_SCRIPT_MANIFEST_SYMLINK_CODE =
  "BPL_RUN_SCRIPT_MANIFEST_SYMLINK";
export const RUN_SCRIPT_MANIFEST_NOT_FILE_CODE =
  "BPL_RUN_SCRIPT_MANIFEST_NOT_FILE";
export const RUN_SCRIPT_MANIFEST_PARENT_SYMLINK_CODE =
  "BPL_RUN_SCRIPT_MANIFEST_PARENT_SYMLINK";
export const RUN_SCRIPT_MANIFEST_INVALID_JSON_CODE =
  "BPL_RUN_SCRIPT_MANIFEST_INVALID_JSON";
export const RUN_SCRIPT_MANIFEST_NOT_OBJECT_CODE =
  "BPL_RUN_SCRIPT_MANIFEST_NOT_OBJECT";
export const RUN_SCRIPT_SCRIPTS_NOT_OBJECT_CODE =
  "BPL_RUN_SCRIPT_SCRIPTS_NOT_OBJECT";
export const RUN_SCRIPT_NAME_EMPTY_CODE = "BPL_RUN_SCRIPT_NAME_EMPTY";
export const RUN_SCRIPT_COMMAND_NOT_STRING_CODE =
  "BPL_RUN_SCRIPT_COMMAND_NOT_STRING";
export const RUN_SCRIPT_COMMAND_EMPTY_CODE =
  "BPL_RUN_SCRIPT_COMMAND_EMPTY";
export const RUN_SCRIPT_NOT_FOUND_CODE = "BPL_RUN_SCRIPT_NOT_FOUND";
export const RUN_SCRIPT_JSON_ERROR_CODES = [
  RUN_SCRIPT_MANIFEST_NOT_FOUND_CODE,
  RUN_SCRIPT_MANIFEST_SYMLINK_CODE,
  RUN_SCRIPT_MANIFEST_NOT_FILE_CODE,
  RUN_SCRIPT_MANIFEST_PARENT_SYMLINK_CODE,
  RUN_SCRIPT_MANIFEST_INVALID_JSON_CODE,
  RUN_SCRIPT_MANIFEST_NOT_OBJECT_CODE,
  RUN_SCRIPT_SCRIPTS_NOT_OBJECT_CODE,
  RUN_SCRIPT_NAME_EMPTY_CODE,
  RUN_SCRIPT_COMMAND_NOT_STRING_CODE,
  RUN_SCRIPT_COMMAND_EMPTY_CODE,
  RUN_SCRIPT_NOT_FOUND_CODE,
] as const;

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
        const jsonFailureCheck =
          options.list || !scriptName
            ? CLI_JSON_CHECKS.runScriptList
            : CLI_JSON_CHECKS.runScript;
        const manifestPath = path.join(process.cwd(), "bpl.json");
        const fail = (message: string, errorCode: string): never =>
          failRunScript(
            message,
            Boolean(options.json),
            jsonFailureCheck,
            errorCode,
          );

        const manifestStat = tryLstat(manifestPath);
        if (!manifestStat) {
          fail(
            "No bpl.json found in current directory.",
            RUN_SCRIPT_MANIFEST_NOT_FOUND_CODE,
          );
        } else if (manifestStat.isSymbolicLink()) {
          fail(
            "bpl.json is a symbolic link.",
            RUN_SCRIPT_MANIFEST_SYMLINK_CODE,
          );
        } else if (!manifestStat.isFile()) {
          fail(
            "bpl.json is not a file.",
            RUN_SCRIPT_MANIFEST_NOT_FILE_CODE,
          );
        }

        const symlinkedManifestParent =
          findSymlinkedParentPath(manifestPath);
        if (symlinkedManifestParent) {
          fail(
            `bpl.json parent path contains a symbolic link: ${symlinkedManifestParent}.`,
            RUN_SCRIPT_MANIFEST_PARENT_SYMLINK_CODE,
          );
        }

        let manifest: any;
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        } catch (_e) {
          fail(
            "Failed to parse bpl.json",
            RUN_SCRIPT_MANIFEST_INVALID_JSON_CODE,
          );
        }
        if (
          !manifest ||
          typeof manifest !== "object" ||
          Array.isArray(manifest)
        ) {
          fail(
            "bpl.json must contain a JSON object.",
            RUN_SCRIPT_MANIFEST_NOT_OBJECT_CODE,
          );
        }

        const scripts = getPackageScripts(manifest, fail);

        if (options.list || !scriptName) {
          printScriptList(scripts, Boolean(options.json));
          return;
        }

        const script = scripts.find((entry) => entry.name === scriptName);

        if (!script) {
          const message = `Script '${scriptName}' not found in bpl.json`;
          if (options.json) {
            fail(message, RUN_SCRIPT_NOT_FOUND_CODE);
          }

          log.error(message);
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

        const parentPath =
          process.env.PATH ?? process.env.Path ?? process.env.path ?? "";
        const PATH = [localBin, globalBin, nodeBin, parentPath]
          .filter((entry) => entry.length > 0)
          .join(path.delimiter);

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

function failRunScript(
  message: string,
  outputJson: boolean,
  check: string,
  errorCode: string,
): never {
  if (outputJson) {
    console.log(
      JSON.stringify(
        createJsonReport(check, false, {
          error: message,
          errorCode,
        }),
        null,
        2,
      ),
    );
  } else {
    log.error(message);
  }

  process.exit(1);
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

function getPackageScripts(
  manifest: any,
  fail: (message: string, errorCode: string) => never,
): PackageScript[] {
  if (!manifest.scripts) {
    return [];
  }

  if (typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts)) {
    fail(
      "'scripts' in bpl.json must be an object",
      RUN_SCRIPT_SCRIPTS_NOT_OBJECT_CODE,
    );
  }

  return Object.entries(manifest.scripts).map(([name, command]) => {
    if (name.length === 0) {
      fail(
        "'scripts' entries must use non-empty script names",
        RUN_SCRIPT_NAME_EMPTY_CODE,
      );
    }

    if (typeof command !== "string") {
      fail(
        `Script '${name}' in bpl.json must be a non-empty string`,
        RUN_SCRIPT_COMMAND_NOT_STRING_CODE,
      );
    }

    if (command.trim().length === 0) {
      fail(
        `Script '${name}' in bpl.json must be a non-empty string`,
        RUN_SCRIPT_COMMAND_EMPTY_CODE,
      );
    }

    return { name, command };
  });
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

function printScriptList(scripts: PackageScript[], outputJson: boolean): void {
  if (outputJson) {
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.runScriptList, true, { scripts }),
        null,
        2,
      ),
    );
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

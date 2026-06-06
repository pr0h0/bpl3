/**
 * New project command registrar.
 * Keeps project scaffolding dependencies out of CLI help startup.
 */

import type { Command } from "commander";

export {
  NEW_PROJECT_JSON_ERROR_CODES,
  NEW_PROJECT_NAME_INVALID_CODE,
  NEW_PROJECT_NAME_PATH_CODE,
  NEW_PROJECT_PATH_EXISTS_DIRECTORY_CODE,
  NEW_PROJECT_PATH_EXISTS_NOT_DIRECTORY_CODE,
  NEW_PROJECT_PATH_EXISTS_SYMLINK_CODE,
  NEW_PROJECT_TEMPLATE_INVALID_CODE,
} from "./NewContracts";

interface NewCommandOptions {
  verbose?: boolean;
  git?: boolean;
  template?: string;
  json?: boolean;
}

export function registerNewCommand(program: Command): void {
  program
    .command("new")
    .argument("<name>", "name of the new project")
    .description("Create a new BPL project with standard structure")
    .option("--template <name>", "project template: app or library", "app")
    .option("-v, --verbose", "enable verbose output")
    .option("--no-git", "do not initialize git repository")
    .option("--json", "output machine-readable project creation result")
    .action(
      async (name: string, options: NewCommandOptions, command: Command) => {
        const { runNewCommand } = await import("./newAction");
        runNewCommand(name, options, command);
      },
    );
}

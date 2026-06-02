/**
 * New Project Command Handler
 * Scaffolds a new BPL project with proper structure
 */

import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import {
  Logger,
  LogLevel,
  resetLogLevel,
  setLogLevel,
} from "../../compiler/common/Logger";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import { BPL_PACKAGE_SCHEMA_URI } from "../../compiler/common/PackageManifestSchema";
import { writeFileAtomically } from "../utils";

const log = new Logger("New");

export const NEW_PROJECT_NAME_PATH_CODE = "BPL_NEW_NAME_PATH";
export const NEW_PROJECT_NAME_INVALID_CODE = "BPL_NEW_NAME_INVALID";
export const NEW_PROJECT_TEMPLATE_INVALID_CODE = "BPL_NEW_TEMPLATE_INVALID";
export const NEW_PROJECT_PATH_EXISTS_DIRECTORY_CODE =
  "BPL_NEW_PATH_EXISTS_DIRECTORY";
export const NEW_PROJECT_PATH_EXISTS_SYMLINK_CODE =
  "BPL_NEW_PATH_EXISTS_SYMLINK";
export const NEW_PROJECT_PATH_EXISTS_NOT_DIRECTORY_CODE =
  "BPL_NEW_PATH_EXISTS_NOT_DIRECTORY";
export const NEW_PROJECT_JSON_ERROR_CODES = [
  NEW_PROJECT_NAME_PATH_CODE,
  NEW_PROJECT_NAME_INVALID_CODE,
  NEW_PROJECT_TEMPLATE_INVALID_CODE,
  NEW_PROJECT_PATH_EXISTS_DIRECTORY_CODE,
  NEW_PROJECT_PATH_EXISTS_SYMLINK_CODE,
  NEW_PROJECT_PATH_EXISTS_NOT_DIRECTORY_CODE,
] as const;

type NewTemplate = "app" | "library";

interface NewCommandOptions {
  verbose?: boolean;
  git?: boolean;
  template?: string;
  json?: boolean;
}

interface NewProjectResult {
  name: string;
  template: NewTemplate;
  projectPath: string;
  manifestPath: string;
  entrypoint: string;
  gitInitialized: boolean;
}

class NewCommandError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly projectPath: string | null,
  ) {
    super(message);
  }
}

/**
 * Register the new command
 *
 * The `new` command creates a new BPL project with a standard structure.
 * It generates a bpl.json manifest, main.bpl entry point, and lib directory.
 *
 * Examples:
 *   bpl new my-project
 *   bpl new my-lib --template library
 *   bpl new my-app --no-git
 *   bpl new calculator -v
 */
export function registerNewCommand(program: Command): void {
  program
    .command("new")
    .argument("<name>", "name of the new project")
    .description("Create a new BPL project with standard structure")
    .option("--template <name>", "project template: app or library", "app")
    .option("-v, --verbose", "enable verbose output")
    .option("--no-git", "do not initialize git repository")
    .option("--json", "output machine-readable project creation result")
    .action((name: string, options: NewCommandOptions, command: Command) => {
      const globalOpts = command.parent?.opts() || {};
      const outputJson = Boolean(options.json || globalOpts.json);
      if (outputJson) {
        setLogLevel(LogLevel.SILENT);
      }
      const requestedTemplate = options.template ?? "app";
      let projectPath: string | null = null;
      try {
        validateProjectName(name);

        projectPath = path.resolve(process.cwd(), name);
        const template = validateTemplate(requestedTemplate, projectPath);
        assertProjectPathAvailable(projectPath);

        let gitInitialized = false;
        const entrypoint = template === "library" ? "src/index.bpl" : "main.bpl";
        const manifestPath = path.join(projectPath, "bpl.json");
        let stagingPath: string | null = createProjectStagingDir(projectPath);
        try {
          if (options.verbose) {
            log.info(`Created staging directory: ${stagingPath}`);
          }

          // Create bpl.json manifest
          const manifest =
            template === "library"
              ? {
                  $schema: BPL_PACKAGE_SCHEMA_URI,
                  name,
                  version: "0.1.0",
                  type: "library",
                  description: `A BPL library named ${name}`,
                  main: "src/index.bpl",
                  dependencies: {},
                  devDependencies: {},
                }
              : {
                  $schema: BPL_PACKAGE_SCHEMA_URI,
                  name,
                  version: "0.1.0",
                  type: "app",
                  description: `A BPL project named ${name}`,
                  main: "main.bpl",
                  dependencies: {},
                  devDependencies: {},
                };

          writeFileAtomically(
            path.join(stagingPath, "bpl.json"),
            JSON.stringify(manifest, null, 2) + "\n",
          );
          if (options.verbose) {
            log.info("Created bpl.json");
          }

          if (template === "library") {
            fs.mkdirSync(path.join(stagingPath, "src"), { recursive: true });
            fs.mkdirSync(path.join(stagingPath, "examples"), {
              recursive: true,
            });

            const libraryContent = `# ${name}
# Public package entry point

export add;

frame add(left: int, right: int) ret int {
    return left + right;
}
`;

            writeFileAtomically(
              path.join(stagingPath, "src", "index.bpl"),
              libraryContent,
            );
            if (options.verbose) {
              log.info("Created src/index.bpl");
            }

            const usageContent = `# ${name} usage example

import add from "../src/index.bpl";

extern printf(fmt: string, ...);

frame main() ret int {
    local total: int = add(20, 22);
    printf("total = %d\\n", total);
    return total - 42;
}
`;

            writeFileAtomically(
              path.join(stagingPath, "examples", "usage.bpl"),
              usageContent,
            );
            if (options.verbose) {
              log.info("Created examples/usage.bpl");
            }
          } else {
            // Create main.bpl
            const mainContent = `# ${name}
# Main entry point

extern printf(fmt: string, ...);

frame main() ret int {
    printf("Hello from ${name}!\\n");
    return 0;
}
`;

            writeFileAtomically(
              path.join(stagingPath, "main.bpl"),
              mainContent,
            );
            if (options.verbose) {
              log.info("Created main.bpl");
            }

            // Create lib directory
            fs.mkdirSync(path.join(stagingPath, "lib"), { recursive: true });
            if (options.verbose) {
              log.info("Created lib/");
            }
          }

          // Create README.md
          const readmeContent =
            template === "library"
              ? `# ${name}

${manifest.description}

## Getting Started

\`\`\`bash
# Type check the package entry point
bpl check src/index.bpl

# Run the usage example
bpl run examples/usage.bpl

# Package the library
bpl pack
\`\`\`

## Project Structure

- \`src/index.bpl\` - Public package entry point
- \`examples/usage.bpl\` - Small executable example
- \`bpl.json\` - Project manifest

## Documentation

See the [BPL Language Documentation](https://github.com/pr0h0/bpl) for more information.
`
              : `# ${name}

${manifest.description}

## Getting Started

\`\`\`bash
# Run the program
bpl run main.bpl

# Development mode (watch and run)
bpl dev main.bpl

# Build executable
bpl build main.bpl -o ${name}

# Type check
bpl check main.bpl
\`\`\`

## Project Structure

- \`main.bpl\` - Main entry point
- \`lib/\` - Library modules
- \`bpl.json\` - Project manifest

## Documentation

See the [BPL Language Documentation](https://github.com/pr0h0/bpl) for more information.
`;

          writeFileAtomically(
            path.join(stagingPath, "README.md"),
            readmeContent,
          );
          if (options.verbose) {
            log.info("Created README.md");
          }

          // Create .gitignore
          const gitignoreContent = `# BPL build artifacts
*.ll
*.o
*.exe
*.out
main
a.out

# Dependencies
bpl_modules/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;

          writeFileAtomically(
            path.join(stagingPath, ".gitignore"),
            gitignoreContent,
          );
          if (options.verbose) {
            log.info("Created .gitignore");
          }

          fs.renameSync(stagingPath, projectPath);
          stagingPath = null;
          if (options.verbose) {
            log.info(`Created directory: ${projectPath}`);
          }
        } finally {
          if (stagingPath) {
            fs.rmSync(stagingPath, { recursive: true, force: true });
          }
        }

        // Initialize git repository if not disabled
        if (options.git !== false) {
          try {
            const { execSync } = require("child_process");
            execSync("git init", { cwd: projectPath, stdio: "ignore" });
            execSync("git add .", { cwd: projectPath, stdio: "ignore" });
            execSync('git commit -m "Initial commit"', {
              cwd: projectPath,
              stdio: "ignore",
            });
            gitInitialized = true;
            if (options.verbose) {
              log.info("Initialized git repository");
            }
          } catch {
            // Silently fail if git is not available
          }
        }

        const result: NewProjectResult = {
          name,
          template,
          projectPath,
          manifestPath,
          entrypoint,
          gitInitialized,
        };

        if (outputJson) {
          console.log(
            JSON.stringify(
              createJsonReport(CLI_JSON_CHECKS.projectNew, true, {
                ...result,
              }),
              null,
              2,
            ),
          );
          return;
        }

        // Success message
        log.info(`\n✓ Created project: ${name}\n`);
        log.info("Next steps:");
        log.info(`  cd ${name}`);
        log.info(
          template === "library"
            ? "  bpl check src/index.bpl"
            : "  bpl run main.bpl",
        );
        log.info("\nHappy coding! 🚀\n");
      } catch (e) {
        if (outputJson) {
          const errorProjectPath =
            e instanceof NewCommandError ? e.projectPath : projectPath;
          console.log(
            JSON.stringify(
              createJsonReport(CLI_JSON_CHECKS.projectNew, false, {
                name,
                template: requestedTemplate,
                projectPath: errorProjectPath,
                error: e instanceof Error ? e.message : String(e),
                ...formatNewCommandErrorCode(e),
              }),
              null,
              2,
            ),
          );
          process.exit(1);
        }
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      } finally {
        if (outputJson) {
          resetLogLevel();
        }
      }
    });
}

function validateProjectName(name: string): void {
  if (
    name.includes("/") ||
    name.includes("\\") ||
    path.basename(name) !== name
  ) {
    throw new NewCommandError(
      "Invalid project name. Use a package name, not a path.",
      NEW_PROJECT_NAME_PATH_CODE,
      null,
    );
  }

  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new NewCommandError(
      `Invalid project name: ${name} (use lowercase letters, numbers, and hyphens only).`,
      NEW_PROJECT_NAME_INVALID_CODE,
      null,
    );
  }
}

function validateTemplate(template: string, projectPath: string): NewTemplate {
  if (template === "app" || template === "library") {
    return template;
  }

  throw new NewCommandError(
    "Unsupported template. Use 'app' or 'library'.",
    NEW_PROJECT_TEMPLATE_INVALID_CODE,
    projectPath,
  );
}

function assertProjectPathAvailable(projectPath: string): void {
  const existingPath = tryLstat(projectPath);
  if (!existingPath) return;

  if (existingPath.isDirectory()) {
    throw new NewCommandError(
      `Directory already exists: ${projectPath}`,
      NEW_PROJECT_PATH_EXISTS_DIRECTORY_CODE,
      projectPath,
    );
  }

  if (existingPath.isSymbolicLink()) {
    throw new NewCommandError(
      `Project path already exists as a symbolic link: ${projectPath}`,
      NEW_PROJECT_PATH_EXISTS_SYMLINK_CODE,
      projectPath,
    );
  }

  throw new NewCommandError(
    `Project path already exists and is not a directory: ${projectPath}`,
    NEW_PROJECT_PATH_EXISTS_NOT_DIRECTORY_CODE,
    projectPath,
  );
}

function formatNewCommandErrorCode(
  error: unknown,
): { errorCode: string } | Record<string, never> {
  if (error instanceof NewCommandError) {
    return { errorCode: error.code };
  }

  return {};
}

function createProjectStagingDir(projectPath: string): string {
  const projectParent = path.dirname(projectPath);
  const projectName = path.basename(projectPath);
  return fs.mkdtempSync(path.join(projectParent, `.${projectName}.staging-`));
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

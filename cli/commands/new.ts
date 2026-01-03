/**
 * New Project Command Handler
 * Scaffolds a new BPL project with proper structure
 */

import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("New");

/**
 * Register the new command
 *
 * The `new` command creates a new BPL project with a standard structure.
 * It generates a bpl.json manifest, main.bpl entry point, and lib directory.
 *
 * Examples:
 *   bpl new my-project
 *   bpl new my-app --no-git
 *   bpl new calculator -v
 */
export function registerNewCommand(program: Command): void {
  program
    .command("new")
    .argument("<name>", "name of the new project")
    .description("Create a new BPL project with standard structure")
    .option("-v, --verbose", "enable verbose output")
    .option("--no-git", "do not initialize git repository")
    .action((name: string, options: { verbose?: boolean; git?: boolean }) => {
      try {
        const projectPath = path.resolve(process.cwd(), name);

        // Check if directory already exists
        if (fs.existsSync(projectPath)) {
          log.error(`Directory already exists: ${projectPath}`);
          process.exit(1);
        }

        // Create project directory
        fs.mkdirSync(projectPath, { recursive: true });
        if (options.verbose) {
          log.info(`Created directory: ${projectPath}`);
        }

        // Create bpl.json manifest
        const manifest = {
          name,
          version: "0.1.0",
          description: `A BPL project named ${name}`,
          main: "main.bpl",
          dependencies: {},
          devDependencies: {},
        };

        fs.writeFileSync(
          path.join(projectPath, "bpl.json"),
          JSON.stringify(manifest, null, 2) + "\n",
        );
        if (options.verbose) {
          log.info("Created bpl.json");
        }

        // Create main.bpl
        const mainContent = `# ${name}
# Main entry point

extern printf(fmt: string, ...);

frame main() ret int {
    printf("Hello from ${name}!\\n");
    return 0;
}
`;

        fs.writeFileSync(path.join(projectPath, "main.bpl"), mainContent);
        if (options.verbose) {
          log.info("Created main.bpl");
        }

        // Create lib directory
        fs.mkdirSync(path.join(projectPath, "lib"), { recursive: true });
        if (options.verbose) {
          log.info("Created lib/");
        }

        // Create README.md
        const readmeContent = `# ${name}

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

        fs.writeFileSync(path.join(projectPath, "README.md"), readmeContent);
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

        fs.writeFileSync(
          path.join(projectPath, ".gitignore"),
          gitignoreContent,
        );
        if (options.verbose) {
          log.info("Created .gitignore");
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
            if (options.verbose) {
              log.info("Initialized git repository");
            }
          } catch {
            // Silently fail if git is not available
          }
        }

        // Success message
        log.info(`\n✓ Created project: ${name}\n`);
        log.info("Next steps:");
        log.info(`  cd ${name}`);
        log.info("  bpl run main.bpl");
        log.info("\nHappy coding! 🚀\n");
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });
}

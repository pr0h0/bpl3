/**
 * Package Management Commands
 * Handles pack, install, list, uninstall, init commands
 */

import * as fs from "fs";
import { Command } from "commander";
import { PackageManager } from "../../compiler";
import type {
  PackageOptionsGlobal,
  PackageOptionsOutput,
  PackageOptionsVerbose,
} from "../types";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("Package");

/**
 * Register all package management commands
 */
export function registerPackageCommands(program: Command): void {
  // Pack command
  program
    .command("pack [dir]")
    .description("Create a distributable package from a BPL project")
    .option("-o, --output <dir>", "output directory for the package")
    .action((dir: string | undefined, options: PackageOptionsOutput) => {
      try {
        const packageDir = dir || process.cwd();
        const pm = new PackageManager();
        const tarball = pm.pack(packageDir, options.output);
        log.info(`Package ready: ${tarball}`);
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  // Install command
  program
    .command("install [package]")
    .description("Install a BPL package")
    .option("-g, --global", "install package globally")
    .option("-v, --verbose", "verbose output")
    .action((pkg: string | undefined, options: PackageOptionsVerbose) => {
      try {
        const pm = new PackageManager();

        if (!pkg) {
          // Install dependencies from bpl.json in current directory
          if (!fs.existsSync("bpl.json")) {
            log.error("No bpl.json found in current directory");
            process.exit(1);
          }

          const manifest = pm.loadManifest(process.cwd());
          const deps = {
            ...manifest.dependencies,
            ...manifest.devDependencies,
          };

          if (Object.keys(deps).length === 0) {
            log.info("No dependencies to install");
            return;
          }

          log.info(`Installing ${Object.keys(deps).length} dependencies...`);
          for (const [name, version] of Object.entries(deps)) {
            pm.install(`${name}-${version}.tgz`, options);
          }
        } else {
          pm.install(pkg, options);
        }
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  // List command
  program
    .command("list")
    .description("List installed packages")
    .option("-g, --global", "list global packages")
    .action((options: PackageOptionsGlobal) => {
      try {
        const pm = new PackageManager();
        const packages = pm.list(options);

        if (packages.length === 0) {
          log.info("No packages installed");
          return;
        }

        log.info(
          `Installed packages (${options.global ? "global" : "local"}):\n`,
        );
        for (const pkg of packages) {
          log.info(`  ${pkg.manifest.name}@${pkg.manifest.version}`);
          if (pkg.manifest.description) {
            log.info(`    ${pkg.manifest.description}`);
          }
          if (pkg.path) {
            log.info(`    Location: ${pkg.path}`);
          }
        }
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  // Init command
  program
    .command("init [name]")
    .description("Initialize a new BPL project")
    .action((name: string | undefined) => {
      try {
        const pm = new PackageManager();
        pm.init(process.cwd(), name);
        log.info("Initialized new BPL project");
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  // Uninstall command
  program
    .command("uninstall <package>")
    .alias("remove")
    .description("Uninstall a package")
    .option("-g, --global", "uninstall global package")
    .action((pkg: string, options: PackageOptionsGlobal) => {
      try {
        const pm = new PackageManager();
        pm.uninstall(pkg, options);
        log.info(`Uninstalled ${pkg}`);
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });
}

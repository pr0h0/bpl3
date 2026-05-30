/**
 * Package Management Commands
 * Handles pack, install, list, uninstall, init commands
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { Command } from "commander";
import {
  PackageManager,
  Compiler,
  CompilerError,
  type PackageCacheEntry,
  type PackageDependencyTreeNode,
} from "../../compiler";
import type {
  PackageOptionsGlobal,
  PackageOptionsOutput,
  PackageOptionsVerbose,
} from "../types";
import { Logger } from "../../compiler/common/Logger";
import { diagnosticFormatter } from "../DiagnosticFormatter";

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
        const packageDir = dir ? path.resolve(dir) : process.cwd();
        const pm = new PackageManager();

        // Check if code compiles before packing
        const manifest = pm.loadManifest(packageDir);
        const mainFile = manifest.main || "index.bpl";
        const entryPath = path.join(packageDir, mainFile);

        if (fs.existsSync(entryPath)) {
          log.info(`Verifying package integrity: ${mainFile}`);
          const content = fs.readFileSync(entryPath, "utf-8");

          const compiler = new Compiler({
            filePath: entryPath,
            resolveImports: true,
            emitType: "llvm",
            verbose: false,
          });

          const result = compiler.compile(content);

          if (!result.success) {
            log.error(
              "Package verification failed - compilation errors detected:",
            );
            if (result.errors) {
              console.error(diagnosticFormatter.formatErrors(result.errors));
            }
            process.exit(1);
          }

          // Verify LLVM IR validity by running clang -S
          // This catches CodeGen errors like invalid instructions that TypeChecker missed
          if (result.output) {
            const tempLL = path.join(
              os.tmpdir(),
              `bpl_pack_verify_${Date.now()}.ll`,
            );
            fs.writeFileSync(tempLL, result.output);

            try {
              const cc = process.env.CC || "clang";
              const check = spawnSync(
                cc,
                [
                  "-S",
                  "-o",
                  os.devNull,
                  "-x",
                  "ir",
                  tempLL,
                  "-Wno-override-module",
                ],
                { encoding: "utf-8" },
              );

              if (check.status !== 0) {
                log.error(
                  "Package verification failed - generated invalid code:",
                );
                console.error(check.stderr || "Unknown clang error");
                process.exit(1);
              }
            } catch (e) {
              // If clang is missing, we warn but allow packing (maybe cross-compiling or no clang env)
              log.warn(
                `Skipping IR verification: ${e instanceof Error ? e.message : String(e)}`,
              );
            } finally {
              if (fs.existsSync(tempLL)) {
                fs.unlinkSync(tempLL);
              }
            }
          }
        } else {
          log.warn(`Warning: Package entry point '${mainFile}' not found.`);
        }

        const tarball = pm.pack(packageDir, options.output);
        log.info(`Package ready: ${tarball}`);
      } catch (e) {
        log.error(formatPackageCommandError(e));
        process.exit(1);
      }
    });

  // Install command
  program
    .command("install [package]")
    .description("Install a BPL package")
    .option("-g, --global", "install package globally")
    .option("-v, --verbose", "verbose output")
    .option("--locked", "verify bpl.lock without changing installed packages")
    .option("--update", "re-resolve bpl.json dependencies and rewrite bpl.lock")
    .option(
      "--repair-lock",
      "rewrite bpl.lock from currently installed packages",
    )
    .action((pkg: string | undefined, options: PackageOptionsVerbose) => {
      try {
        const pm = new PackageManager();

        if (pkg && (options.update || options.repairLock)) {
          throw new CompilerError(
            "--update and --repair-lock are project install options",
            "Run 'bpl install --update' or 'bpl install --repair-lock' without a package argument.",
            {
              file: process.cwd(),
              startLine: 1,
              startColumn: 1,
              endLine: 1,
              endColumn: 1,
            },
          );
        }

        if (!pkg) {
          pm.installProject(options);
        } else {
          pm.install(pkg, options);
        }
      } catch (e) {
        log.error(formatPackageCommandError(e));
        process.exit(1);
      }
    });

  // List command
  program
    .command("list")
    .description("List installed packages")
    .option("-g, --global", "list global packages")
    .option("--tree", "show dependency tree")
    .action((options: PackageOptionsGlobal) => {
      try {
        const pm = new PackageManager();

        if (options.tree) {
          const tree = pm.getDependencyTree(options);

          if (tree.length === 0) {
            log.info("No packages installed");
            return;
          }

          log.info(
            `Dependency tree (${options.global ? "global" : "local"}):\n`,
          );
          for (const line of formatDependencyTree(tree)) {
            log.info(line);
          }
          return;
        }

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
        log.error(formatPackageCommandError(e));
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
        log.error(formatPackageCommandError(e));
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
        log.error(formatPackageCommandError(e));
        process.exit(1);
      }
    });

  const packageCache = program
    .command("package-cache")
    .description("List and clean cached package archives");

  packageCache
    .command("list [package]")
    .description("List cached package archives")
    .option("--json", "output machine-readable cache entries")
    .action(
      (
        packageName: string | undefined,
        options: { json?: boolean },
        command: Command,
      ) => {
        try {
          const pm = new PackageManager();
          const entries = pm.listPackageCache(packageName);
          const globalOpts = command.parent?.parent?.opts() || {};
          const outputJson = options.json || globalOpts.json;

          if (outputJson) {
            console.log(JSON.stringify(entries, null, 2));
            return;
          }

          if (entries.length === 0) {
            log.info("No cached package archives found");
            return;
          }

          log.info("Cached package archives:\n");
          for (const entry of entries) {
            log.info(`  ${formatPackageCacheEntry(entry)}`);
          }
        } catch (e) {
          log.error(formatPackageCommandError(e));
          process.exit(1);
        }
      },
    );

  packageCache
    .command("clean [package]")
    .description("Remove cached package archives")
    .option(
      "--package-version <version>",
      "only remove a specific package version",
    )
    .option("--dry-run", "show what would be removed without deleting files")
    .action(
      (
        packageName: string | undefined,
        options: { packageVersion?: string; dryRun?: boolean },
      ) => {
        try {
          const pm = new PackageManager();
          const result = pm.cleanPackageCache({
            packageName,
            version: options.packageVersion,
            dryRun: options.dryRun,
          });

          if (result.removed.length === 0) {
            log.info("No cached package archives matched");
            return;
          }

          for (const entry of result.removed) {
            log.info(
              `${result.dryRun ? "Would remove" : "Removed"} ${formatPackageCacheEntry(entry)}`,
            );
          }
          log.info(
            `${result.dryRun ? "Would remove" : "Removed"} ${result.removed.length} cached archive(s)`,
          );
        } catch (e) {
          log.error(formatPackageCommandError(e));
          process.exit(1);
        }
      },
    );
}

function formatPackageCommandError(error: unknown): string {
  if (error instanceof CompilerError) {
    return error.toString();
  }

  return error instanceof Error ? error.message : String(error);
}

function formatDependencyTree(nodes: PackageDependencyTreeNode[]): string[] {
  const lines: string[] = [];

  const visit = (node: PackageDependencyTreeNode, depth: number) => {
    const indent = "  ".repeat(depth);
    const version = node.version ? `@${node.version}` : "";
    const missing = node.installed ? "" : " (missing)";
    const locked = node.locked ? " [locked]" : "";
    const source = node.source ? ` <- ${node.source}` : "";
    lines.push(`${indent}${node.name}${version}${missing}${locked}${source}`);

    for (const problem of node.problems) {
      lines.push(`${indent}  ! ${problem}`);
    }

    for (const dependency of node.dependencies) {
      visit(dependency, depth + 1);
    }
  };

  for (const node of nodes) {
    visit(node, 1);
  }

  return lines;
}

function formatPackageCacheEntry(entry: PackageCacheEntry): string {
  const sizeKiB = (entry.sizeBytes / 1024).toFixed(2);
  return `${entry.name}@${entry.version} (${sizeKiB} KiB) ${entry.path}`;
}

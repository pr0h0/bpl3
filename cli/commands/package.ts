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
  type PackageCacheRepairResult,
  type PackageCacheVerificationIssue,
  type PackageCacheVerificationReport,
  type PackageDependencyTreeNode,
} from "../../compiler";
import type {
  PackageOptionsGlobal,
  PackageOptionsOutput,
  PackageOptionsVerbose,
} from "../types";
import { getCompilerDriver } from "../../compiler/common/CompilerDriver";
import {
  getPositiveIntegerEnv,
  TIMEOUT_ENV_DEFAULTS,
} from "../../compiler/common/Env";
import {
  Logger,
  LogLevel,
  resetLogLevel,
  setLogLevel,
} from "../../compiler/common/Logger";
import { formatCommandSpawnFailure } from "../../compiler/common/ProcessErrors";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import { diagnosticFormatter } from "../DiagnosticFormatter";

const log = new Logger("Package");
const PACKAGE_IR_VERIFY_TIMEOUT_MS =
  TIMEOUT_ENV_DEFAULTS.BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS;
const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Register all package management commands
 */
export function registerPackageCommands(program: Command): void {
  // Pack command
  program
    .command("pack [dir]")
    .description("Create a distributable package from a BPL project")
    .option("-o, --output <dir>", "output directory for the package")
    .action((dir: string | undefined, options: PackageOptionsOutput, command: Command) => {
      try {
        const globalOpts = command.parent?.opts() || {};
        const packageDir = dir ? path.resolve(dir) : process.cwd();
        const outputDir = options.output || globalOpts.output;
        const pm = new PackageManager();

        // Check if code compiles before packing
        const manifest = pm.loadManifest(packageDir);
        const mainFile = manifest.main || "index.bpl";
        const entryPath = path.join(packageDir, mainFile);

        const entryStats = tryLstat(entryPath);
        if (entryStats) {
          if (entryStats.isSymbolicLink()) {
            throw new Error(
              `Package entry point is a symbolic link: ${entryPath}`,
            );
          }
          if (!entryStats.isFile()) {
            throw new Error(`Package entry point is not a file: ${entryPath}`);
          }

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

          // Verify LLVM IR validity with the selected compiler driver.
          // This catches CodeGen errors like invalid instructions that TypeChecker missed
          if (result.output) {
            verifyPackageLLVMIR(result.output);
          }
        } else {
          log.warn(`Warning: Package entry point '${mainFile}' not found.`);
        }

        const tarball = pm.pack(packageDir, outputDir);
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
    .option("--json", "output machine-readable install result")
    .action(
      (
        pkg: string | undefined,
        options: PackageOptionsVerbose,
        command: Command,
      ) => {
        const globalOpts = command.parent?.opts() || {};
        const outputJson = Boolean(options.json || globalOpts.json);
        if (outputJson) {
          setLogLevel(LogLevel.SILENT);
        }
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
              "BPL_PACKAGE_INSTALL_PROJECT_OPTION_WITH_PACKAGE",
            );
          }

          if (!pkg) {
            pm.installProject(options);
          } else {
            pm.install(pkg, options);
          }

          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageInstall, true, {
                  ...formatPackageInstallJsonPayload(pkg, options),
                }),
                null,
                2,
              ),
            );
          }
        } catch (e) {
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageInstall, false, {
                  ...formatPackageInstallJsonPayload(pkg, options),
                  error: formatPackageCommandJsonError(e),
                  ...formatPackageCommandErrorCode(e),
                }),
                null,
                2,
              ),
            );
            process.exit(1);
          }
          log.error(formatPackageCommandError(e));
          process.exit(1);
        } finally {
          if (outputJson) {
            resetLogLevel();
          }
        }
      },
    );

  // List command
  program
    .command("list")
    .description("List installed packages")
    .option("-g, --global", "list global packages")
    .option("--tree", "show dependency tree")
    .option("--json", "output machine-readable installed package data")
    .action((options: PackageOptionsGlobal, command: Command) => {
      const globalOpts = command.parent?.opts() || {};
      const outputJson = options.json || globalOpts.json;
      const scope = options.global ? "global" : "local";
      try {
        const pm = new PackageManager();

        if (options.tree) {
          const tree = pm.getDependencyTree(options);

          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageListTree, true, {
                  scope,
                  tree,
                }),
                null,
                2,
              ),
            );
            return;
          }

          if (tree.length === 0) {
            log.info("No packages installed");
            return;
          }

          log.info(`Dependency tree (${scope}):\n`);
          for (const line of formatDependencyTree(tree)) {
            log.info(line);
          }
          return;
        }

        const packages = pm.list(options);

        if (outputJson) {
          console.log(
            JSON.stringify(
              createJsonReport(CLI_JSON_CHECKS.packageList, true, {
                scope,
                packages: packages.map((pkg) => ({
                  name: pkg.manifest.name,
                  version: pkg.manifest.version,
                  description: pkg.manifest.description,
                  path: pkg.path,
                  hash: pkg.hash,
                })),
              }),
              null,
              2,
            ),
          );
          return;
        }

        if (packages.length === 0) {
          log.info("No packages installed");
          return;
        }

        log.info(`Installed packages (${scope}):\n`);
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
        if (outputJson) {
          const error = formatPackageCommandJsonError(e);
          console.log(
            JSON.stringify(
              options.tree
                ? createJsonReport(CLI_JSON_CHECKS.packageListTree, false, {
                    scope,
                    tree: [],
                    error,
                  })
                : createJsonReport(CLI_JSON_CHECKS.packageList, false, {
                    scope,
                    packages: [],
                    error,
                  }),
              null,
              2,
            ),
          );
          process.exit(1);
        }
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
    .description("List, verify, repair, and clean cached package archives");

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
        const globalOpts = command.parent?.parent?.opts() || {};
        const outputJson = options.json || globalOpts.json;
        try {
          const pm = new PackageManager();
          const entries = pm.listPackageCache(packageName);

          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageCacheList, true, {
                  entries,
                }),
                null,
                2,
              ),
            );
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
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageCacheList, false, {
                  entries: [],
                  error: formatPackageCommandJsonError(e),
                }),
                null,
                2,
              ),
            );
            process.exit(1);
          }
          log.error(formatPackageCommandError(e));
          process.exit(1);
        }
      },
    );

  packageCache
    .command("verify [package]")
    .description("Verify cached package archive provenance")
    .option("--json", "output machine-readable verification report")
    .action(
      (
        packageName: string | undefined,
        options: { json?: boolean },
        command: Command,
      ) => {
        const globalOpts = command.parent?.parent?.opts() || {};
        const outputJson = options.json || globalOpts.json;
        try {
          const pm = new PackageManager();
          const report = pm.verifyPackageCache(packageName);

          if (outputJson) {
            console.log(JSON.stringify(report, null, 2));
          } else {
            logPackageCacheVerificationReport(report);
          }

          if (!report.ok) {
            process.exit(1);
          }
        } catch (e) {
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageCacheVerify, false, {
                  ok: false,
                  entriesChecked: 0,
                  issues: [],
                  error: formatPackageCommandJsonError(e),
                }),
                null,
                2,
              ),
            );
            process.exit(1);
          }
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
    .option("--json", "output machine-readable clean result")
    .action(
      (
        packageName: string | undefined,
        options: { packageVersion?: string; dryRun?: boolean; json?: boolean },
        command: Command,
      ) => {
        const globalOpts = command.parent?.parent?.opts() || {};
        const outputJson = options.json || globalOpts.json;
        try {
          const pm = new PackageManager();
          const result = pm.cleanPackageCache({
            packageName,
            version: options.packageVersion,
            dryRun: options.dryRun,
          });

          if (outputJson) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

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
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageCacheClean, false, {
                  removed: [],
                  dryRun: Boolean(options.dryRun),
                  error: formatPackageCommandJsonError(e),
                }),
                null,
                2,
              ),
            );
            process.exit(1);
          }
          log.error(formatPackageCommandError(e));
          process.exit(1);
        }
      },
    );

  packageCache
    .command("repair [package]")
    .description("Regenerate missing or invalid package cache provenance")
    .option(
      "--package-version <version>",
      "only repair a specific package version",
    )
    .option("--dry-run", "show what would be repaired without writing files")
    .option("--json", "output machine-readable repair result")
    .action(
      (
        packageName: string | undefined,
        options: {
          packageVersion?: string;
          dryRun?: boolean;
          json?: boolean;
        },
        command: Command,
      ) => {
        const globalOpts = command.parent?.parent?.opts() || {};
        const outputJson = options.json || globalOpts.json;
        try {
          const pm = new PackageManager();
          const result = pm.repairPackageCache(packageName, {
            version: options.packageVersion,
            dryRun: options.dryRun,
          });

          if (outputJson) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            logPackageCacheRepairResult(result);
          }

          if (result.issues.length > 0) {
            process.exit(1);
          }
        } catch (e) {
          if (outputJson) {
            console.log(
              JSON.stringify(
                createJsonReport(CLI_JSON_CHECKS.packageCacheRepair, false, {
                  dryRun: Boolean(options.dryRun),
                  repaired: [],
                  unchanged: [],
                  issues: [],
                  error: formatPackageCommandJsonError(e),
                }),
                null,
                2,
              ),
            );
            process.exit(1);
          }
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

function formatPackageCommandJsonError(error: unknown): string {
  return formatPackageCommandError(error).replace(ANSI_ESCAPE_PATTERN, "");
}

function formatPackageCommandErrorCode(
  error: unknown,
): { errorCode: string } | Record<string, never> {
  if (error instanceof CompilerError && error.code) {
    return { errorCode: error.code };
  }

  return {};
}

function formatPackageInstallJsonPayload(
  pkg: string | undefined,
  options: PackageOptionsVerbose,
): {
  mode: "package" | "project";
  target: string | null;
  global: boolean;
  locked: boolean;
  update: boolean;
  repairLock: boolean;
} {
  return {
    mode: pkg ? "package" : "project",
    target: pkg ?? null,
    global: Boolean(options.global),
    locked: Boolean(options.locked),
    update: Boolean(options.update),
    repairLock: Boolean(options.repairLock),
  };
}

function verifyPackageLLVMIR(llvmIR: string): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-pack-verify-"));
  try {
    const tempLL = path.join(tempDir, "input.ll");
    fs.writeFileSync(tempLL, llvmIR);

    const cc = getPackageVerifierDriver();
    if (!cc) return;

    const check = spawnSync(
      cc,
      ["-S", "-o", os.devNull, "-x", "ir", tempLL, "-Wno-override-module"],
      { encoding: "utf-8", timeout: getPackageIrVerifyTimeoutMs() },
    );

    if (check.error) {
      log.warn(
        `Skipping IR verification: ${formatSpawnFailure(check.error, cc)}`,
      );
      return;
    }

    if (check.status !== 0) {
      throw new Error(
        [
          "Package verification failed - generated invalid code:",
          check.stderr || `Unknown ${cc} error`,
        ].join("\n"),
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function getPackageIrVerifyTimeoutMs(): number {
  return getPositiveIntegerEnv(
    "BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS",
    PACKAGE_IR_VERIFY_TIMEOUT_MS,
    {
      warn: (message) => log.warn(message),
    },
  );
}

function formatSpawnFailure(error: Error, command: string): string {
  return formatCommandSpawnFailure(command, error) ?? `${command}: ${error.message}`;
}

function getPackageVerifierDriver(): string | null {
  try {
    return getCompilerDriver();
  } catch (e) {
    // If the compiler driver is missing, warn but allow packing.
    log.warn(
      `Skipping IR verification: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
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
  return `${entry.name}@${entry.version} (${sizeKiB} KiB) ${entry.path} [provenance: ${entry.provenanceStatus}]`;
}

function logPackageCacheVerificationReport(
  report: PackageCacheVerificationReport,
): void {
  const summary = `${report.entriesChecked} archive(s) checked`;
  if (report.ok) {
    log.info(`Package cache OK (${summary})`);
    return;
  }

  log.error(`Package cache FAIL (${summary}, ${report.issues.length} issue(s))`);
  for (const issue of report.issues) {
    log.error(`  ${formatPackageCacheVerificationIssue(issue)}`);
  }
}

function formatPackageCacheVerificationIssue(
  issue: PackageCacheVerificationIssue,
): string {
  const provenance = issue.provenancePath
    ? ` provenance=${issue.provenancePath}`
    : "";
  return `[${issue.kind}] ${issue.message} path=${issue.path}${provenance}`;
}

function logPackageCacheRepairResult(result: PackageCacheRepairResult): void {
  const verb = result.dryRun ? "Would repair" : "Repaired";

  for (const entry of result.repaired) {
    log.info(`${verb} ${formatPackageCacheEntry(entry)}`);
  }

  if (result.repaired.length === 0 && result.issues.length === 0) {
    log.info("No package cache provenance needed repair");
  } else {
    log.info(
      `${verb} ${result.repaired.length} cached archive(s); ${result.unchanged.length} already verified`,
    );
  }

  for (const issue of result.issues) {
    log.error(`  ${formatPackageCacheVerificationIssue(issue)}`);
  }
}

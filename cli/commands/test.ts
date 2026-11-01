/**
 * Test command registrar.
 * Keeps compiler dependencies out of CLI help startup.
 */

import type { Command } from "commander";

export const TEST_NO_INPUTS_CODE = "BPL_TEST_NO_INPUTS";
export const TEST_PROCESSING_ERROR_CODE = "BPL_TEST_PROCESSING_ERROR";
export const TEST_JSON_ERROR_CODES = [
  TEST_NO_INPUTS_CODE,
  TEST_PROCESSING_ERROR_CODE,
] as const;

export interface TestOptions {
  json?: boolean;
  filter?: string;
  verbose?: boolean;
  list?: boolean;
  failFast?: boolean;
  color?: boolean;
}

/**
 * `bpl test [paths...]` builds every `*_test.bpl` file it finds and runs each
 * test frame (a top-level `frame testName()` or `frame test_name()` without
 * parameters) in its own process.
 */
export function registerTestCommand(program: Command): void {
  program
    .command("test [paths...]")
    .description(
      "Run test frames in *_test.bpl files (default: the current directory)",
    )
    .option("-f, --filter <text>", "run only tests whose name contains text")
    .option("-v, --verbose", "show the output of passing tests too")
    .option("--list", "list the tests that would run, without building them")
    .option("--fail-fast", "stop after the first failing test or file")
    .option("--json", "output test results in JSON format")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .action(
      async (paths: string[], _options: TestOptions, command: Command) => {
        const { runTestCommand } = await import("./testAction");
        // The root program also defines --json and --color.
        process.exitCode = await runTestCommand(
          paths,
          command.optsWithGlobals<TestOptions>(),
        );
      },
    );
}

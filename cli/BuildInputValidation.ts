import type { CompileOptions } from "./types";
import {
  BUILD_CONFLICTING_INPUTS_CODE,
  BUILD_NO_INPUTS_CODE,
} from "./BuildErrorCodes";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../compiler/common/JsonContracts";
import { Logger } from "../compiler/common/Logger";

const log = new Logger("CLI");

export function emitBuildValidationErrorAndExit(
  message: string,
  errorCode: string,
  options: CompileOptions,
): never {
  if (options.json) {
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.build, false, {
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

export function emitNoInputBuildErrorAndExit(
  options: CompileOptions,
): never {
  emitBuildValidationErrorAndExit(
    "No input files specified.",
    BUILD_NO_INPUTS_CODE,
    options,
  );
}

export function validateCompileInputSources(
  files: string[] | undefined,
  options: CompileOptions,
): void {
  const inputSources: string[] = [];
  if (files && files.length > 0) inputSources.push("file arguments");
  if (options.eval !== undefined) inputSources.push("--eval");
  if (options.stdin) inputSources.push("--stdin");

  if (inputSources.length > 1) {
    emitBuildValidationErrorAndExit(
      `Conflicting input sources: ${inputSources.join(", ")}. Choose exactly one of file arguments, --eval, or --stdin.`,
      BUILD_CONFLICTING_INPUTS_CODE,
      options,
    );
  }
}

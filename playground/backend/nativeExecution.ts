import {
  runProcessFile,
  type RunProcessFileError,
} from "./processRunner";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BUFFER = 1024 * 1024;

export interface PlaygroundNativeExecutionOptions {
  args?: string[];
  input?: string;
  timeoutMs?: number;
  maxBuffer?: number;
}

export type PlaygroundNativeExecutionResult =
  | {
      success: true;
      output: string;
    }
  | {
      success: false;
      error: string;
      output: string;
    };

function formatTimeoutDuration(timeoutMs: number): string {
  if (timeoutMs % 1000 === 0) {
    return `${timeoutMs / 1000} seconds`;
  }

  return `${timeoutMs}ms`;
}

export async function runPlaygroundNativeBinary(
  binFile: string,
  options: PlaygroundNativeExecutionOptions = {},
): Promise<PlaygroundNativeExecutionResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const { stdout, stderr } = await runProcessFile(
      binFile,
      options.args ?? [],
      {
        input: options.input,
        timeout: timeoutMs,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
      },
    );

    return {
      success: true,
      output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
    };
  } catch (error) {
    const processError = error as RunProcessFileError;
    if (processError.killed) {
      return {
        success: false,
        error: `Execution timeout (${formatTimeoutDuration(timeoutMs)})`,
        output: processError.stdout || "",
      };
    }

    return {
      success: false,
      error: `Runtime error: ${processError.stderr || processError.message}`,
      output: processError.stdout || "",
    };
  }
}

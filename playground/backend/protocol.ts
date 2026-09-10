export interface CompileRequest {
  code: string;
  input?: string;
  args?: string[];
  includeArtifacts?: boolean;
  execute?: boolean;
}

export interface CompileResponse {
  success: boolean;
  output?: string;
  error?: string;
  warnings?: string[];
  ir?: string;
  ast?: string;
  tokens?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCompileRequestPayload(
  payload: unknown,
):
  | { success: true; request: CompileRequest }
  | { success: false; error: string } {
  if (!isRecord(payload)) {
    return {
      success: false,
      error: "Invalid request: body must be a JSON object.",
    };
  }

  if (typeof payload.code !== "string") {
    return {
      success: false,
      error: "Invalid request: code must be a string.",
    };
  }

  if (payload.input !== undefined && typeof payload.input !== "string") {
    return {
      success: false,
      error: "Invalid request: input must be a string.",
    };
  }

  if (
    payload.args !== undefined &&
    (!Array.isArray(payload.args) ||
      payload.args.some((arg) => typeof arg !== "string"))
  ) {
    return {
      success: false,
      error: "Invalid request: args must be an array of strings.",
    };
  }

  if (
    payload.includeArtifacts !== undefined &&
    typeof payload.includeArtifacts !== "boolean"
  ) {
    return {
      success: false,
      error: "Invalid request: includeArtifacts must be a boolean.",
    };
  }

  if (payload.execute !== undefined && typeof payload.execute !== "boolean") {
    return {
      success: false,
      error: "Invalid request: execute must be a boolean.",
    };
  }

  if (Buffer.byteLength(payload.code) > 128 * 1024) {
    return { success: false, error: "Invalid request: code exceeds 128 KiB." };
  }
  if (
    payload.input !== undefined &&
    Buffer.byteLength(payload.input) > 256 * 1024
  ) {
    return { success: false, error: "Invalid request: input exceeds 256 KiB." };
  }
  if (
    payload.args !== undefined &&
    (payload.args.length > 64 ||
      payload.args.some(
        (arg: string) => arg.includes("\0") || Buffer.byteLength(arg) > 4096,
      ))
  ) {
    return {
      success: false,
      error:
        "Invalid request: at most 64 arguments, each at most 4 KiB without NUL bytes.",
    };
  }

  return {
    success: true,
    request: {
      code: payload.code,
      input: payload.input,
      args: payload.args,
      includeArtifacts: payload.includeArtifacts,
      execute: payload.execute,
    },
  };
}

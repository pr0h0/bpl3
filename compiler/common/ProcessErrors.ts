export function getProcessErrorCode(error: Error | undefined): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  return String(error.code);
}

interface SpawnFailureFormatOptions {
  permissionDenied?: string;
}

export function formatSpawnFailureReason(
  error: Error | undefined,
  options: SpawnFailureFormatOptions = {},
): string | undefined {
  if (!error) {
    return undefined;
  }

  const code = getProcessErrorCode(error);
  if (code === "ENOENT") {
    return "command not found";
  }
  if (code === "EACCES") {
    return options.permissionDenied ?? "permission denied";
  }
  if (code === "ENOEXEC") {
    return "not executable";
  }

  return error.message;
}

export function formatCommandSpawnFailure(
  command: string,
  error: Error | undefined,
): string | undefined {
  const reason = formatSpawnFailureReason(error);
  return reason ? `${command}: ${reason}` : undefined;
}

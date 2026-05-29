export function getNativeLinkerFlags(
  platform: NodeJS.Platform | string = process.platform,
): string[] {
  if (platform === "linux") {
    return ["-lm", "-ldl", "-rdynamic"];
  }

  if (platform === "darwin") {
    return ["-lm"];
  }

  return [];
}

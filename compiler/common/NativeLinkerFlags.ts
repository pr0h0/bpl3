export function getNativeCodegenFlags(
  platform: NodeJS.Platform | string = process.platform,
): string[] {
  if (platform === "linux") {
    return ["-ffunction-sections", "-fdata-sections"];
  }

  return [];
}

export function getNativeLinkerFlags(
  platform: NodeJS.Platform | string = process.platform,
): string[] {
  if (platform === "linux") {
    return [
      ...getNativeCodegenFlags(platform),
      "-Wl,--gc-sections",
      "-Wl,--no-export-dynamic",
      "-lm",
      "-ldl",
    ];
  }

  if (platform === "darwin") {
    return ["-lm"];
  }

  return [];
}

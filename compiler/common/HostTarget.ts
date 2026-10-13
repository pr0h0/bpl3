/** LLVM target triple for the current host, shared by API and CLI defaults. */
export function getHostTargetTriple(
  platform: string = process.platform,
  arch: string = process.arch,
): string {
  const architectures: Record<string, string> = {
    x64: "x86_64",
    arm64: "aarch64",
    arm: "arm",
    ia32: "i686",
  };
  const operatingSystems: Record<string, string> = {
    linux: "unknown-linux-gnu",
    darwin: "apple-darwin",
    win32: "pc-windows-msvc",
    freebsd: "unknown-freebsd",
  };
  const targetArch = architectures[arch] ?? arch;
  const targetOs = operatingSystems[platform] ?? `unknown-${platform}-gnu`;
  return `${targetArch}-${targetOs}`;
}

import { execSync } from "child_process";

export function compileAsmFile(inputFilePath: string): string {
  const outputFilePath = inputFilePath.replace(/\.[^/.]+$/, "") + ".o";
  execSync(`nasm -f elf64 -g -F dwarf "${inputFilePath}" -o "${outputFilePath}"`);
  return outputFilePath;
}

export function linkObjectFile(
  objectFilePath: string,
  libsPath: string[],
  outputFilePath: string,
): void {
  const libs = libsPath.map((lib) => `"${lib}"`).join(" ");
  execSync(`gcc "${objectFilePath}" ${libs} -o "${outputFilePath}"`);
}

/** Native LLVM inputs need function attributes: Clang's flag alone only links ASan. */
export function hasAddressSanitizer(flags: readonly string[] = []): boolean {
  let enabled = false;
  for (const flag of flags) {
    if (flag.startsWith("-fsanitize=")) {
      if (flag.slice("-fsanitize=".length).split(",").includes("address"))
        enabled = true;
    } else if (flag.startsWith("-fno-sanitize=")) {
      const disabled = flag.slice("-fno-sanitize=".length).split(",");
      if (disabled.includes("address") || disabled.includes("all"))
        enabled = false;
    }
  }
  return enabled;
}

export function prepareLLVMForAddressSanitizer(
  ir: string,
  flags: readonly string[] = [],
): string {
  if (!hasAddressSanitizer(flags)) return ir;
  const definitions =
    /^[ \t]*define\b[\s\S]*?@(?:"(?:[^"\\]|\\.)*"|[^\s(]+)\s*\(/gm;
  let output = "",
    cursor = 0;
  for (const definition of ir.matchAll(definitions)) {
    const start = definition.index + definition[0].length - 1;
    let depth = 0,
      quoted = false,
      end = -1;
    for (let i = start; i < ir.length; i++) {
      const character = ir[i];
      if (quoted && character === "\\") {
        i++;
        continue;
      }
      if (character === '"') {
        quoted = !quoted;
        continue;
      }
      if (quoted) continue;
      if (character === "(") depth++;
      else if (character === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0)
      throw new Error(
        "Cannot parse LLVM function signature for AddressSanitizer",
      );
    const body = ir.indexOf("{", end + 1);
    if (body < 0)
      throw new Error("Cannot locate LLVM function body for AddressSanitizer");
    const attributes = ir.slice(end + 1, body);
    output += ir.slice(cursor, end + 1);
    if (
      !/\bsanitize_address\b/.test(attributes) &&
      !/\bdisable_sanitizer_instrumentation\b/.test(attributes)
    )
      output += " sanitize_address";
    cursor = end + 1;
  }
  return output + ir.slice(cursor);
}

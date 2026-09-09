/** Format an LLVM constant at the precision of its destination type. */
export function formatFloatingPointLiteral(
  value: number,
  llvmType: "float" | "double",
): string {
  if (llvmType === "float" || !Number.isFinite(value)) {
    // LLVM's hexadecimal float notation stores the rounded float extended
    // to double, not the raw 32-bit encoding.
    const bits = Buffer.allocUnsafe(8);
    bits.writeDoubleBE(llvmType === "float" ? Math.fround(value) : value);
    return `0x${bits.toString("hex").toUpperCase()}`;
  }
  const [mantissa, exponent] = String(value).split("e");
  const decimal = mantissa!.includes(".") ? mantissa! : `${mantissa}.0`;
  return exponent === undefined ? decimal : `${decimal}e${exponent}`;
}

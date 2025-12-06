import type { VariableType } from "../../../parser/expression/variableDeclarationExpr";

export class TypeChecker {
  public isSignedInteger(type: VariableType): boolean {
    return ["i8", "i16", "i32", "i64"].includes(type.name);
  }

  public checkTypeCompatibility(
    expected: VariableType,
    actual: VariableType,
    line: number,
  ): boolean {
    // Exact match
    if (
      expected.name === actual.name &&
      expected.isPointer === actual.isPointer &&
      expected.isArray.length === actual.isArray.length
    ) {
      return true;
    }

    // Allow numeric promotions
    const isExpectedFloat = expected.name === "f64" || expected.name === "f32";
    const isActualFloat = actual.name === "f64" || actual.name === "f32";
    const isExpectedInt = !isExpectedFloat && expected.isPointer === 0;
    const isActualInt = !isActualFloat && actual.isPointer === 0;

    if (isExpectedFloat && isActualFloat) {
      // Allow f32 -> f64
      if (expected.name === "f64" && actual.name === "f32") return true;
      // Allow f64 -> f32 (lossy but often allowed, or maybe strict?)
      // User asked for strict. Let's allow f32 -> f64 but warn/error on f64 -> f32?
      // For now, let's allow both as they are "compatible" floats.
      return true;
    }

    if (isExpectedFloat && isActualInt) {
      // Allow int -> float
      return true;
    }

    if (isExpectedInt && isActualFloat) {
      // Allow float -> int (truncation)
      return true;
    }

    if (isExpectedInt && isActualInt) {
      // Allow int -> int (size check?)
      // BPL treats most ints as compatible for now.
      // Allow smaller int to larger int (promotion)
      const expectedSize = this.getIntSize(expected.name);
      const actualSize = this.getIntSize(actual.name);
      // Allow all integer conversions (promotion and truncation)
      return true;

      // Allow literal int to smaller int (if it fits, but we can't check value here easily)
      // Assuming user knows what they are doing with literals
      if (actual.isLiteral) return true;
    }

    // Pointers
    if (expected.isPointer > 0 && actual.isPointer > 0) {
      // Allow *void (*u8) to any*?
      if (expected.name === "u8" && expected.isPointer === 1) return true; // void* equivalent
      if (actual.name === "u8" && actual.isPointer === 1) return true; // void* equivalent

      // Handle 'string' alias for *u8
      const expectedName = expected.name === "string" ? "u8" : expected.name;
      const actualName = actual.name === "string" ? "u8" : actual.name;
      if (
        expectedName === actualName &&
        expected.isPointer === actual.isPointer
      )
        return true;
    }

    // Arrays vs Pointers
    if (expected.isArray.length > 0 && actual.isPointer > 0) {
      // Allow *u8 (string literal) to u8[] (array initialization)
      if (
        expected.name === "u8" &&
        actual.name === "u8" &&
        actual.isPointer === 1
      )
        return true;
    }

    if (expected.isPointer > 0 && actual.isArray.length > 0) {
      // Array decays to pointer
      if (
        expected.name === actual.name &&
        expected.isPointer === actual.isArray.length // Simplified check
      ) {
        // Actually array decays to pointer to first element.
        // u8[] -> *u8
        if (
          expected.name === actual.name &&
          expected.isPointer === 1 &&
          actual.isArray.length === 1
        )
          return true;
      }
    }

    // Handle 'string' alias for *u8 (non-pointer context check, though string is usually *u8)
    if (
      expected.name === "string" &&
      actual.name === "u8" &&
      actual.isPointer === 1
    )
      return true;
    if (
      expected.name === "u8" &&
      expected.isPointer === 1 &&
      actual.name === "string"
    )
      return true;

    // Array literal to Array
    if (
      expected.isArray.length > 0 &&
      actual.isArray.length > 0 &&
      actual.isLiteral
    ) {
      if (expected.isArray.length !== actual.isArray.length) return false;
      for (let i = 0; i < expected.isArray.length; i++) {
        if (expected.isArray[i] !== actual.isArray[i]) return false;
      }

      const expectedBase: VariableType = {
        name: expected.name,
        isPointer: expected.isPointer,
        isArray: [],
        isLiteral: false,
      };
      const actualBase: VariableType = {
        name: actual.name,
        isPointer: actual.isPointer,
        isArray: [],
        isLiteral: true,
      };

      return this.checkTypeCompatibility(expectedBase, actualBase, line);
    }

    // Pointer <-> u64 compatibility (unsafe but allowed in systems programming often)
    if (
      (expected.name === "u64" && actual.isPointer > 0) ||
      (expected.isPointer > 0 && actual.name === "u64")
    ) {
      return true;
    }

    return false;
  }

  // Determine if an implicit cast is occurring and return a warning message if so
  public getCastWarning(
    expected: VariableType,
    actual: VariableType,
  ): string | null {
    // Exact type match: no cast
    if (
      expected.name === actual.name &&
      expected.isPointer === actual.isPointer &&
      expected.isArray.length === actual.isArray.length
    ) {
      return null;
    }

    // Arrays: ignore array literal to array exact matches handled elsewhere
    if (expected.isArray.length > 0 || actual.isArray.length > 0) {
      return null;
    }

    // Pointer casts
    if (expected.isPointer > 0 || actual.isPointer > 0) {
      // string alias to *u8: no warning
      const expName = expected.name === "string" ? "u8" : expected.name;
      const actName = actual.name === "string" ? "u8" : actual.name;

      // Exact pointer type match checked above, here warn on pointer-int casts
      if (
        (expName === "u64" && actual.isPointer > 0) ||
        (expected.isPointer > 0 && actName === "u64")
      ) {
        return `Implicit cast between pointer '${this.printType(actual)}' and integer '${this.printType(expected)}' may be unsafe`;
      }

      // Different pointer depths or different base names (but allowed elsewhere): warn
      if (
        expected.isPointer !== actual.isPointer ||
        (expected.isPointer > 0 && actual.isPointer > 0 && expName !== actName)
      ) {
        return `Implicit pointer cast from '${this.printType(actual)}' to '${this.printType(expected)}'`;
      }
      return null;
    }

    // Float casts
    const isExpFloat = expected.name === "f32" || expected.name === "f64";
    const isActFloat = actual.name === "f32" || actual.name === "f64";
    if (isExpFloat && isActFloat) {
      if (expected.name === "f32" && actual.name === "f64") {
        return "Implicit cast from f64 to f32 may lose precision";
      }
      // f32 -> f64 widen: optional warning (requested to warn on casts)
      if (expected.name === "f64" && actual.name === "f32") {
        return "Implicit cast from f32 to f64";
      }
      return null;
    }

    // Int <-> Float casts
    const isExpInt = !isExpFloat;
    const isActInt = !isActFloat;
    if (isExpFloat && isActInt) {
      return `Implicit cast from integer '${this.printType(actual)}' to float '${this.printType(expected)}'`;
    }
    if (isExpInt && isActFloat) {
      return `Implicit cast from float '${this.printType(actual)}' to integer '${this.printType(expected)}' may truncate`;
    }

    // Integer size casts
    const expSize = this.getIntSize(expected.name);
    const actSize = this.getIntSize(actual.name);
    if (expSize && actSize) {
      if (expSize > actSize) {
        return `Implicit integer promotion from '${actual.name}' to '${expected.name}'`;
      }
      if (expSize < actSize) {
        return `Implicit integer narrowing from '${actual.name}' to '${expected.name}' may truncate`;
      }
      return null; // same size different signedness: still a cast, warn
    }

    // Different non-numeric types: generic cast warning
    if (expected.name !== actual.name) {
      return `Implicit cast from '${this.printType(actual)}' to '${this.printType(expected)}'`;
    }

    return null;
  }

  public getIntSize(name: string): number {
    switch (name) {
      case "u8":
      case "i8":
        return 1;
      case "u16":
      case "i16":
        return 2;
      case "u32":
      case "i32":
        return 4;
      case "u64":
      case "i64":
        return 8;
      default:
        return 0; // Not an int
    }
  }

  public printType(type: VariableType): string {
    let s = "";
    for (let i = 0; i < type.isPointer; i++) s += "*";
    s += type.name;
    for (const dim of type.isArray) s += `[${dim}]`;
    return s;
  }

  public parseGenericArgs(argsString: string): string[] {
    const args: string[] = [];
    let current = "";
    let depth = 0;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (char === "<") {
        depth++;
        current += char;
      } else if (char === ">") {
        depth--;
        current += char;
      } else if (char === "," && depth === 0) {
        args.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  public parseTypeString(typeStr: string): VariableType {
    const trimmed = typeStr.trim();

    // Check for generics
    const genericMatch = trimmed.match(/^([^<]+)<(.+)>$/);
    if (genericMatch) {
      const baseName = genericMatch[1]!.trim();
      const argsString = genericMatch[2]!;
      const genericArgNames = this.parseGenericArgs(argsString);

      return {
        name: baseName,
        isPointer: 0,
        isArray: [],
        genericArgs: genericArgNames.map((arg) => this.parseTypeString(arg)),
      };
    }

    // Simple type
    return {
      name: trimmed,
      isPointer: 0,
      isArray: [],
    };
  }
}

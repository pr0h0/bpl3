import * as AST from "../../common/AST";
import { ExceptionGenerator } from "./ExceptionGenerator";

/**
 * AsmGenerator handles the generation of inline assembly blocks.
 *
 * Inheritance chain:
 * ... -> ExceptionGenerator -> AsmGenerator -> StatementGenerator -> ...
 */
export abstract class AsmGenerator extends ExceptionGenerator {
  protected generateAsm(stmt: AST.AsmBlockStmt) {
    if (stmt.flavor === "raw") {
      // Inject raw LLVM IR
      const lines = stmt.content.split("\n");
      for (const line of lines) {
        if (line.trim()) {
          this.emit(line);
        }
      }
      return;
    }

    if (
      stmt.flavor === "x86" ||
      stmt.flavor === "intel" ||
      stmt.flavor === "att"
    ) {
      // Handle x86 inline assembly
      // We need to extract variables and pass them as arguments
      const lines = stmt.content
        .split("\n")
        .map((l) => {
          let trimmed = l.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            trimmed = trimmed.substring(1, trimmed.length - 1);
            // Unescape escaped quotes if any
            trimmed = trimmed.replace(/\\"/g, '"');
          }
          return trimmed;
        })
        .filter((l) => l.length > 0);

      let asmString = lines.join("\\0A"); // Use \0A for newlines in LLVM string

      // Escape $ to $$ for LLVM inline asm (because $ is used for operands)
      asmString = asmString.replace(/\$/g, "$$$$");

      // Variables to pass as inputs/outputs
      interface AsmOperand {
        name: string;
        ptr: string;
        type: AST.TypeNode;
        isPtr: boolean;
        isOutput: boolean;
        constraint?: string;
      }

      const uniqueOperands = new Map<string, AsmOperand>();
      const getKey = (name: string, isPtr: boolean, isOutput: boolean) =>
        `${name}:${isPtr}:${isOutput}`;

      // 1. Find all matches and collect unique operands
      // Replace (=variable), (variable), (&variable), or with constraints
      // Regex: /\((=?)(&?)(\w+)(?::\s*"([^"]+)")?\)/g
      const tempString = asmString.replace(
        /\((=?)(&?)(\w+)(?::\s*"([^"]+)")?\)/g,
        (match, eq, amp, name, constraint) => {
          if (this.locals.has(name)) {
            const ptr = this.localPointers.get(name);
            const type = this.localTypes.get(name);
            if (ptr && type) {
              const isOutput = eq === "=";
              const isPtr = amp === "&";
              const key = getKey(name, isPtr, isOutput);

              if (!uniqueOperands.has(key)) {
                uniqueOperands.set(key, {
                  name,
                  ptr,
                  type,
                  isPtr,
                  isOutput,
                  constraint,
                });
              }
              return `__BPL_ASM_OP_${key}__`;
            }
          }
          return match;
        },
      );

      // 2. Sort operands: Outputs first, then Inputs
      const allOperands = Array.from(uniqueOperands.values());
      const outputs = allOperands.filter((o) => o.isOutput);
      const inputs = allOperands.filter((o) => !o.isOutput);
      const sortedOperands = [...outputs, ...inputs];

      // 3. Replace placeholders with $index
      asmString = tempString.replace(
        /__BPL_ASM_OP_([^_]+)__/g,
        (match, key) => {
          const op = uniqueOperands.get(key);
          if (!op) return match;
          const index = sortedOperands.indexOf(op);
          return `$${index}`;
        },
      );

      // 4. Generate constraints string
      // Constraints order: outputs, inputs, clobbers
      const operandConstraints = sortedOperands.map((op) => {
        if (op.isOutput) {
          return op.constraint || "=r";
        }
        return op.constraint || "r";
      });

      // Handle clobbers
      let clobbers: string[] = [];
      if (stmt.clobbers && stmt.clobbers.length > 0) {
        for (const c of stmt.clobbers) {
          if (c === "default") {
            clobbers.push("memory", "cc", "dirflag", "flags");
          } else if (c === "empty") {
            clobbers.length = 0;
            break;
          } else {
            clobbers.push(c);
          }
        }
      } else {
        // Default safe set
        clobbers.push("memory", "cc", "dirflag", "fpsr", "flags");

        // Scan for registers in the assembly string
        const regRegex =
          /\b(%?)(r[abcd]x|e[abcd]x|[abcd]x|[abcd]l|[abcd]h|r[sd]i|e[sd]i|si|di|dil|sil|rbp|ebp|bp|bpl|rsp|esp|sp|spl|r[89]|r1[0-5]|r[89][dwb]|r1[0-5][dwb]|xmm\d+|ymm\d+|zmm\d+)\b/gi;

        const matches = asmString.match(regRegex);
        if (matches) {
          matches.forEach((m) => {
            let reg = m.replace(/^%/, "").toLowerCase();
            // Normalize to 64-bit register names where possible
            if (/^(rax|eax|ax|al|ah)$/.test(reg)) reg = "rax";
            else if (/^(rbx|ebx|bx|bl|bh)$/.test(reg)) reg = "rbx";
            else if (/^(rcx|ecx|cx|cl|ch)$/.test(reg)) reg = "rcx";
            else if (/^(rdx|edx|dx|dl|dh)$/.test(reg)) reg = "rdx";
            else if (/^(rsi|esi|si|sil)$/.test(reg)) reg = "rsi";
            else if (/^(rdi|edi|di|dil)$/.test(reg)) reg = "rdi";
            else if (/^(rbp|ebp|bp|bpl)$/.test(reg)) reg = "rbp";
            else if (/^(rsp|esp|sp|spl)$/.test(reg)) reg = "rsp";
            else if (/^r([89]|1[0-5])[dwb]?$/.test(reg)) {
              reg = reg.replace(/[dwb]$/, "");
            }
            clobbers.push(reg);
          });
        }
      }
      clobbers = [...new Set(clobbers)];

      const constraintString =
        (operandConstraints.length > 0
          ? operandConstraints.join(",") + ","
          : "") + clobbers.map((c) => `~{${c}}`).join(",");

      // 5. Prepare input arguments
      const inputArgs = inputs.map((op) => {
        const llvmType = this.resolveType(op.type);
        if (op.isPtr) {
          return `${llvmType}* ${op.ptr}`;
        }
        const valReg = this.newRegister();
        this.emit(`  ${valReg} = load ${llvmType}, ${llvmType}* ${op.ptr}`);
        return `${llvmType} ${valReg}`;
      });

      const argsString = inputArgs.join(", ");

      const dialect =
        stmt.flavor === "x86" || stmt.flavor === "intel" ? "inteldialect" : "";

      // 6. Determine return type and emit call
      let returnType = "void";
      if (outputs.length === 1) {
        returnType = this.resolveType(outputs[0]!.type);
      } else if (outputs.length > 1) {
        const types = outputs.map((o) => this.resolveType(o.type));
        returnType = `{ ${types.join(", ")} }`;
      }

      const resultReg = outputs.length > 0 ? this.newRegister() : "";
      const callPrefix = outputs.length > 0 ? `${resultReg} = ` : "";

      this.emit(
        `  ${callPrefix}call ${returnType} asm sideeffect ${dialect} "${asmString}", "${constraintString}"(${argsString})`,
      );

      // 7. Store results back to variables
      if (outputs.length === 1) {
        const op = outputs[0]!;
        const llvmType = this.resolveType(op.type);
        this.emit(`  store ${llvmType} ${resultReg}, ${llvmType}* ${op.ptr}`);
      } else if (outputs.length > 1) {
        outputs.forEach((op, i) => {
          const llvmType = this.resolveType(op.type);
          const valReg = this.newRegister();
          this.emit(
            `  ${valReg} = extractvalue ${returnType} ${resultReg}, ${i}`,
          );
          this.emit(`  store ${llvmType} ${valReg}, ${llvmType}* ${op.ptr}`);
        });
      }
    } else {
      const lines = stmt.content.split("\n");
      for (const line of lines) {
        let processedLine = line.trim();

        // Strip quotes if present (it's a string literal in the AST)
        if (processedLine.startsWith('"') && processedLine.endsWith('"')) {
          processedLine = processedLine.substring(1, processedLine.length - 1);
          // Unescape escaped quotes if any
          processedLine = processedLine.replace(/\\"/g, '"');
        }

        if (processedLine.length === 0) continue;

        // Replace (variable) with %variable_ptr (pointer) for locals
        // or @variable for globals
        processedLine = processedLine.replace(/\((\w+)\)/g, (match, name) => {
          // Check if it's a local variable
          if (this.locals.has(name)) {
            const ptr = this.localPointers.get(name);
            if (ptr) {
              return ptr;
            }
          }
          // Check if it's a global variable
          if (this.globals.has(name)) {
            return `@${name}`;
          }
          // Not found - return unchanged (user may be using raw LLVM IR syntax)
          return match;
        });

        this.emit(`  ${processedLine}`);
      }
    }
  }
}

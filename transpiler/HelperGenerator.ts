import type AsmGenerator from "./AsmGenerator";
import type Scope from "./Scope";

export default class HelperGenerator {
  // #region Helper Functions
  static generateHelperFunctions(gen: AsmGenerator, scope: Scope) {
    HelperGenerator.generateGetStringLengthFunction(gen, scope);
    HelperGenerator.generatePrintFunction(gen, scope);
    HelperGenerator.generateExitFunction(gen, scope);
    HelperGenerator.generateExecFunction(gen, scope);
  }

  public static generatePrintFunction(gen: AsmGenerator, scope: Scope) {
    scope.defineFunction("print", {
      label: "print",
      startLabel: "print",
      endLabel: "print_end",
      name: "print",
      args: [
        { type: { name: "u64", isPointer: 1, isArray: [] }, name: "value" },
      ],
      returnType: null,
    });
    gen.emitLabel("print");
    // Function prologue
    gen.emit("push rbp");
    gen.emit("mov rbp, rsp");

    // Assuming the value to print is passed in rdi
    gen.emit("push rdi", "save value to print");
    // gen.emit("mov rdi, rdi", "value to print");
    gen.emit("call str_len", "get string length");

    gen.emit("pop rsi", "restore value to print");
    gen.emit("mov rdx, rax", "length of string");
    gen.emit("mov rax, 1", "syscall: write");
    gen.emit("mov rdi, 1", "file descriptor: stdout");
    gen.emit("syscall");

    // Function epilogue
    gen.emitLabel("print_end");
    gen.emit("mov rsp, rbp");
    gen.emit("pop rbp");
    gen.emit("ret");
  }

  public static generateExitFunction(gen: AsmGenerator, scope: Scope) {
    scope.defineFunction("exit", {
      label: "exit",
      startLabel: "exit",
      endLabel: "exit_end",
      name: "exit",
      args: [
        { type: { name: "u64", isPointer: 0, isArray: [] }, name: "status" },
      ],
      returnType: null,
    });
    gen.emitLabel("exit");

    // Assuming the exit status is passed in rdi
    // gen.emit("mov rdi, rdi", "status: exit code");
    gen.emit("mov rax, 60", "syscall: exit");
    gen.emit("syscall");
  }

  public static generateGetStringLengthFunction(
    gen: AsmGenerator,
    scope: Scope,
  ) {
    scope.defineFunction("str_len", {
      label: "str_len",
      startLabel: "str_len",
      endLabel: "str_len_end",
      name: "str_len",
      args: [{ type: { name: "u64", isPointer: 1, isArray: [] }, name: "str" }],
      returnType: { name: "u64", isPointer: 0, isArray: [] },
    });
    gen.emitLabel("str_len");

    // Assuming the string pointer is passed in rdi
    gen.emit("xor rcx, rcx", "length counter");
    gen.emitLabel("str_len_loop");
    gen.emit("cmp byte [rdi + rcx], 0", "check for null terminator");
    gen.emit("je str_len_end", "if null terminator, end loop");
    gen.emit("inc rcx", "increment length counter");
    gen.emit("jmp str_len_loop", "repeat loop");
    gen.emitLabel("str_len_end");

    // Return length in rax
    gen.emitLabel("str_len_end");
    gen.emit("mov rax, rcx", "return length in rax");
    gen.emit("ret");
  }

  public static generateExecFunction(gen: AsmGenerator, scope: Scope) {
    scope.defineFunction("exec", {
      label: "exec",
      startLabel: "exec",
      endLabel: "exec_end",
      name: "exec",
      args: [
        { type: { name: "u8", isPointer: 1, isArray: [] }, name: "command" },
      ],
      returnType: { name: "u8", isPointer: 1, isArray: [] },
    });

    gen.emitImportStatement("extern popen");
    gen.emitImportStatement("extern pclose");
    gen.emitImportStatement("extern fread");
    gen.emitImportStatement("extern malloc");

    const modeLabel = gen.generateLabel("mode_r");
    gen.emitRoData(modeLabel, "db", '"r", 0');

    gen.emitLabel("exec");
    gen.emit("push rbp");
    gen.emit("mov rbp, rsp");
    gen.emit("sub rsp, 32"); // Allocate stack space (aligned to 16 bytes)

    gen.emit("mov [rbp-8], rdi", "save command");
    gen.emit("lea rsi, [rel " + modeLabel + "]");
    gen.emit("call popen WRT ..plt");
    gen.emit("mov [rbp-16], rax", "save FILE*");

    gen.emit("cmp rax, 0");
    gen.emit("je exec_fail");

    gen.emit("mov rdi, 4096");
    gen.emit("call malloc WRT ..plt");
    gen.emit("mov [rbp-24], rax", "save buffer");

    gen.emit("cmp rax, 0");
    gen.emit("je exec_fail_close");

    gen.emit("mov rdi, [rbp-24]");
    gen.emit("mov rsi, 1");
    gen.emit("mov rdx, 4095");
    gen.emit("mov rcx, [rbp-16]");
    gen.emit("call fread WRT ..plt");

    gen.emit("mov rcx, [rbp-24]");
    gen.emit("mov byte [rcx + rax], 0");

    gen.emit("mov rdi, [rbp-16]");
    gen.emit("call pclose WRT ..plt");

    gen.emit("mov rax, [rbp-24]");
    gen.emit("jmp exec_end");

    gen.emitLabel("exec_fail_close");
    gen.emit("mov rdi, [rbp-16]");
    gen.emit("call pclose WRT ..plt");

    gen.emitLabel("exec_fail");
    gen.emit("xor rax, rax");

    gen.emitLabel("exec_end");
    gen.emit("leave");
    gen.emit("ret");
  }
  // #endregion

  // #region Base Types
  static generateBaseTypes(gen: AsmGenerator, scope: Scope): void {
    scope.defineType("u8", {
      size: 1,
      alignment: 1,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u8",
      info: {
        description: "Unsigned 8-bit integer",
        signed: false,
        range: [0, 255],
      },
      members: new Map(),
    });

    scope.defineType("u16", {
      size: 2,
      alignment: 2,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u16",
      info: {
        description: "Unsigned 16-bit integer",
        signed: false,
        range: [0, 65535],
      },
      members: new Map(),
    });

    scope.defineType("u32", {
      size: 4,
      alignment: 4,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u32",
      info: {
        description: "Unsigned 32-bit integer",
        signed: false,
        range: [0, 4294967295],
      },
      members: new Map(),
    });

    scope.defineType("u64", {
      size: 8,
      alignment: 8,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u64",
      info: {
        description: "Unsigned 64-bit integer",
        signed: false,
        range: [0, 18446744073709551615],
      },
      members: new Map(),
    });

    scope.defineType("i8", {
      size: 1,
      alignment: 1,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i8",
      info: {
        description: "Signed 8-bit integer",
        signed: true,
        range: [-128, 127],
      },
      members: new Map(),
    });

    scope.defineType("i16", {
      size: 2,
      alignment: 2,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i16",
      info: {
        description: "Signed 16-bit integer",
        signed: true,
        range: [-32768, 32767],
      },
      members: new Map(),
    });

    scope.defineType("i32", {
      size: 4,
      alignment: 4,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i32",
      info: {
        description: "Signed 32-bit integer",
        signed: true,
        range: [-2147483648, 2147483647],
      },
      members: new Map(),
    });

    scope.defineType("i64", {
      size: 8,
      alignment: 8,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i64",
      info: {
        description: "Signed 64-bit integer",
        signed: true,
        range: [-9223372036854775808, 9223372036854775807],
      },
      members: new Map(),
    });
  }
  // #endregion
}

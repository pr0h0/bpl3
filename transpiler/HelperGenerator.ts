import type AsmGenerator from "./AsmGenerator";
import type Scope from "./Scope";

export default class HelperGenerator {
  static generateHelperFunctions(gen: AsmGenerator, scope: Scope) {
    HelperGenerator.generatePrintFunction(gen, scope);
  }

  private static generatePrintFunction(gen: AsmGenerator, scope: Scope) {
    scope.defineFunction("print", "Helper function to print a value to stdout");
    gen.emitLabel("print");
    // Function prologue
    gen.emit("push rbp");
    gen.emit("mov rbp, rsp");

    // Assuming the value to print is passed in rdi
    gen.emit("mov rax, 1", "syscall: write");
    gen.emit("mov rsi, rdi", "buffer: value to print");
    gen.emit("mov rdi, 1", "file descriptor: stdout");
    gen.emit(
      "mov rdx, 20",
      "number of bytes to write (assuming max 20 bytes for simplicity)",
    );
    gen.emit("syscall");

    // Function epilogue
    gen.emit("mov rsp, rbp");
    gen.emit("pop rbp");
    gen.emit("ret");
  }

  public static generateExitFunction(gen: AsmGenerator, scope: Scope) {
    scope.defineFunction("exit", "Helper function to exit the program");
    gen.emitLabel("exit");
    // Function prologue
    gen.emit("push rbp");
    gen.emit("mov rbp, rsp");

    // Assuming the exit status is passed in rdi
    gen.emit("mov rax, 60", "syscall: exit");
    gen.emit("mov rdi, rdi", "status: exit code");
    gen.emit("syscall");
  }
}

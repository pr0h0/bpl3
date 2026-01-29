import { describe, expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { execSync } from "child_process";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function check(source: string): number {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    throw typeErrors[0];
  }

  const codeGen = new CodeGenerator();
  const llvmIR = codeGen.generate(program);

  // Create temp directory and files
  const tempDir = mkdtempSync(join(tmpdir(), "bpl-test-"));
  const llFile = join(tempDir, "test.ll");
  const exeFile = join(tempDir, "test");

  try {
    writeFileSync(llFile, llvmIR);
    const runtimePath = join(process.cwd(), "lib/runtime.ll");
    const runtimeSupportPath = join(process.cwd(), "lib/runtime_support.o");
    execSync(
      `clang -Wno-override-module ${llFile} "${runtimePath}" "${runtimeSupportPath}" -o ${exeFile} -rdynamic`,
      {
        stdio: "pipe",
      },
    );
    const result = execSync(exeFile, { stdio: "pipe" });
    return result.length > 0 ? result[0]! : 0;
  } catch (error: any) {
    if (error.status !== undefined) {
      return error.status;
    }
    throw error;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("Enum Match with Outer Scope Variables", () => {
  test("struct variant with outer scope variable", () => {
    const code = `
      enum Message {
        Move { x: int, y: int },
        Write { text: int },
        Quit,
      }
      
      frame main() ret int {
        local a: int = 10;
        local msg: Message = Message.Move { x: 5, y: 7 };
        
        local result: int = match (msg) {
          Message.Move { x: px, y: py } => px + py + a,
          Message.Write { text: t } => t + a,
          Message.Quit => a,
        };
        
        return result;
      }
    `;
    expect(check(code)).toBe(22);
  });

  test("tuple variant with outer scope variable", () => {
    const code = `
      enum Message {
        Move(int, int),
        Write(int),
        Quit,
      }
      
      frame main() ret int {
        local a: int = 10;
        local msg: Message = Message.Move(5, 7);
        
        local result: int = match (msg) {
          Message.Move(x, y) => x + y + a,
          Message.Write(t) => t + a,
          Message.Quit => a,
        };
        
        return result;
      }
    `;
    expect(check(code)).toBe(22);
  });

  test("multiple matches with multiple scope variables", () => {
    const code = `
      enum Event {
        Click { x: int, y: int },
        KeyPress(int),
        Scroll { delta: int },
        None,
      }
      
      frame main() ret int {
        local a: int = 10;
        
        local e1: Event = Event.Click { x: 1, y: 2 };
        local e2: Event = Event.KeyPress(3);
        local e3: Event = Event.Scroll { delta: 4 };
        local e4: Event = Event.None;
        
        local r1: int = match (e1) {
          Event.Click { x: px, y: py } => px + py + a,
          Event.KeyPress(code) => code + a,
          Event.Scroll { delta: d } => d + a,
          Event.None => a,
        };
        
        local r2: int = match (e2) {
          Event.Click { x: px, y: py } => px + py + a,
          Event.KeyPress(code) => code + a,
          Event.Scroll { delta: d } => d + a,
          Event.None => a,
        };
        
        local r3: int = match (e3) {
          Event.Click { x: px, y: py } => px + py + a,
          Event.KeyPress(code) => code + a,
          Event.Scroll { delta: d } => d + a,
          Event.None => a,
        };
        
        local r4: int = match (e4) {
          Event.Click { x: px, y: py } => px + py + a,
          Event.KeyPress(code) => code + a,
          Event.Scroll { delta: d } => d + a,
          Event.None => a,
        };
        
        return r1 + r2 + r3 + r4;
      }
    `;
    expect(check(code)).toBe(50);
  });

  test("complex expressions with outer scope variables", () => {
    const code = `
      enum Event {
        Click { x: int, y: int },
        Value(int),
      }
      
      frame main() ret int {
        local base: int = 10;
        
        local e1: Event = Event.Click { x: 5, y: 8 };
        local e2: Event = Event.Value(7);
        
        local r1: int = match (e1) {
          Event.Click { x: px, y: py } => px + py + base,
          Event.Value(v) => v + base,
        };
        
        local r2: int = match (e2) {
          Event.Click { x: px, y: py } => px + py + base,
          Event.Value(v) => v + base,
        };
        
        return r1 + r2;
      }
    `;
    expect(check(code)).toBe(40); // (5+8+10) + (7+10) = 23 + 17 = 40
  });
});

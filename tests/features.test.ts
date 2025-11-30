import { describe, it, expect } from "bun:test";
import { transpileProgram, parseLibraryFile } from "../utils/transpiler";
import { parseFile } from "../utils/parser";
import AsmGenerator from "../transpiler/AsmGenerator";
import Scope from "../transpiler/Scope";
import { compileAsmFile, linkObjectFile } from "../utils/compiler";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = "/tmp/bpl_feature_tests";

function runCode(code: string): string {
    if (!existsSync(TEST_DIR)) {
        mkdirSync(TEST_DIR);
    }
    const filename = join(TEST_DIR, `test_${Date.now()}_${Math.floor(Math.random() * 1000)}.x`);
    writeFileSync(filename, code);
    
    try {
        const scope = new Scope();
        const objectFiles = parseLibraryFile(filename, scope);
        
        const program = parseFile(filename) as any; // Cast to any to avoid type issues in test
        const gen = new AsmGenerator();
        gen.setSourceFile(filename);
        
        const asm = transpileProgram(program, gen, scope);
        const asmFile = filename.replace(".x", ".asm");
        writeFileSync(asmFile, asm);
        
        const objFile = compileAsmFile(asmFile);
        const exeFile = filename.replace(".x", "");
        
        linkObjectFile(objFile, objectFiles, exeFile);
        
        // console.log("Running:", exeFile);
        const output = execSync(exeFile, { encoding: 'utf-8' });
        // console.log("Output:", output);
        
        // Cleanup
        unlinkSync(filename);
        unlinkSync(asmFile);
        unlinkSync(objFile);
        unlinkSync(exeFile);
        objectFiles.forEach(f => {
            if (f.endsWith(".o") && existsSync(f)) unlinkSync(f);
        });
        
        return output.trim();
    } catch (e: any) {
        console.error("Error in runCode:", e.message);
        if (e.stdout) console.log("Stdout:", e.stdout.toString());
        if (e.stderr) console.log("Stderr:", e.stderr.toString());
        // Cleanup on error
        try { unlinkSync(filename); } catch {}
        throw e;
    }
}

describe("New Features Integration", () => {
    it("should handle switch statements", () => {
        const code = `
            import print from "std";
            
            frame main() ret u64 {
                local x: u64 = 2;
                switch x {
                    case 1: { call print("One\\n"); }
                    case 2: { call print("Two\\n"); }
                    case 3: { call print("Three\\n"); }
                }
                return 0;
            }
        `;
        expect(runCode(code)).toBe("Two");
    });

    it("should handle switch with default", () => {
        const code = `
            import print from "std";
            
            frame main() ret u64 {
                local x: u64 = 5;
                switch x {
                    case 1: { call print("One\\n"); }
                    case 2: { call print("Two\\n"); }
                    default: { call print("Default\\n"); }
                }
                return 0;
            }
        `;
        expect(runCode(code)).toBe("Default");
    });

    it("should handle float operations", () => {
        const code = `
            import printf, fflush from "libc";
            extern printf(fmt: *u8, ...) ret i32;
            extern fflush(stream: *u8) ret i32;

            frame main() ret u64 {
                local a: f64 = 10.5;
                local b: f64 = 2.5;
                local c: f64 = a + b;
                call printf("%.1f\\n", c);
                call fflush(0);
                return 0;
            }
        `;
        expect(runCode(code)).toBe("13.0");
    });

    it("should handle generic structs", () => {
        const code = `
            import printf, fflush from "libc";
            extern printf(fmt: *u8, ...) ret i32;
            extern fflush(stream: *u8) ret i32;

            struct Box<T> {
                value: T,
            }

            frame main() ret u64 {
                local b: Box<u64>;
                b.value = 42;
                call printf("%d\\n", b.value);
                call fflush(0);
                return 0;
            }
        `;
        expect(runCode(code)).toBe("42");
    });

    it("should handle nested generic structs", () => {
        const code = `
            import printf, fflush from "libc";
            extern printf(fmt: *u8, ...) ret i32;
            extern fflush(stream: *u8) ret i32;

            struct Box<T> {
                value: T,
            }
            
            struct Container<T> {
                item: T,
            }

            frame main() ret u64 {
                local c: Container<Box<u64>>;
                c.item.value = 123;
                call printf("%d\\n", c.item.value);
                call fflush(0);
                return 0;
            }
        `;
        expect(runCode(code)).toBe("123");
    });
});

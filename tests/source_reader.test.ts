import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { runBpl } from "./runtime_utils";
import * as fs from "fs";
import * as path from "path";

describe("SourceReader", () => {
  const srcDir = path.resolve(process.cwd(), "src");
  const sourceReaderPath = path.join(srcDir, "source_reader.bpl");

  const tempFilePath = path.resolve(
    process.cwd(),
    "tests/source_read_test_file.txt",
  );
  const tempContent = "Line 1\nLine 2\nLine 3";

  beforeAll(() => {
    fs.writeFileSync(tempFilePath, tempContent);
  });

  afterAll(() => {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("should manage source files in memory", () => {
    const program = `
        import [SourceManager] from "${sourceReaderPath}";
        import [SourceFile] from "${sourceReaderPath}";
        import [String] from "std/string.bpl";
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
            local sm: SourceManager = SourceManager.new();
            local content: string = "hello\\nworld\\n";
            local idx: int = sm.addFile("test.bpl", content);
            
            local sf: *SourceFile = sm.getFile(idx);
            
            printf("Path: %s\\n", sf.path.cstr());
            printf("Lines: %d\\n", sf.getLineCount());
            printf("Line 0 start: %d\\n", sf.getLineStart(0));
            # Line 0: "hello\\n" (6 chars). Line 1 start should be 6.
            printf("Line 1 start: %d\\n", sf.getLineStart(1));
            
            local line0: String = sf.getLineContent(0);
            printf("Line 0 content: '%s'\\n", line0.cstr());
            line0.destroy();
            
            local line1: String = sf.getLineContent(1);
            printf("Line 1 content: '%s'\\n", line1.cstr());
            line1.destroy();

            sm.destroy();
            return 0;
        }
        `;
    const result = runBpl(program, "source_manager_mem");
    if (result.exitCode !== 0) {
      console.error(result.stderr);
    }
    expect(result.stdout).toContain("Path: test.bpl");
    // "hello\nworld\n":
    // 0: hello\n
    // 6: world\n
    // 12: (empty)
    // lines array: [0, 6, 12] -> count 3
    expect(result.stdout).toContain("Lines: 3");
    expect(result.stdout).toContain("Line 0 start: 0");
    expect(result.stdout).toContain("Line 1 start: 6");
    expect(result.stdout).toContain("Line 0 content: 'hello'"); // substring(0, 6-1=5) ?  getLineStart(1)-1 is 6-1=5. Wait.
    // getLineContent logic: end = 6-1 = 5. start=0. len = 5.
    // 'hello' has 5 chars. So yes.
    expect(result.stdout).toContain("Line 1 content: 'world'");
  });

  it("should read file from disk", () => {
    const program = `
        import [SourceManager] from "${sourceReaderPath}";
        import [SourceFile] from "${sourceReaderPath}";
        import [String] from "std/string.bpl";
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
            local sm: SourceManager = SourceManager.new();
            
            local idx: int = sm.readFile("${tempFilePath}");
            local sf: *SourceFile = sm.getFile(idx);
            
            printf("File loaded lines: %d\\n", sf.getLineCount());
            
            local l0: String = sf.getLineContent(0);
            printf("L0: '%s'\\n", l0.cstr());
            l0.destroy();
            
            local l2: String = sf.getLineContent(2);
            printf("L2: '%s'\\n", l2.cstr());
            l2.destroy();
            
            sm.destroy();
            return 0;
        }
        `;
    const result = runBpl(program, "source_manager_disk");
    if (result.exitCode !== 0) {
      console.error(result.stderr);
    }
    expect(result.stdout).toContain("File loaded lines: 3");
    expect(result.stdout).toContain("L0: 'Line 1'");
    expect(result.stdout).toContain("L2: 'Line 3'");
  });
});

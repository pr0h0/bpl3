import { expect, test } from "bun:test";
import {
  hasAddressSanitizer,
  prepareLLVMForAddressSanitizer,
} from "../compiler/common/LLVMAddressSanitizer";
import {
  runBplWithSanitizers,
  checkBplSanitizerSupport,
} from "./helpers/compilerCorrectness";

test("native sanitizer flags tag definitions while preserving signatures and metadata", () => {
  const ir =
    'define i32 @ordinary(i32 %sanitize_address) #0 !dbg !4 {\n ret i32 0\n}\ndefine i32 (i32)* @factory(i32 (i32)* %callback) {\n ret i32 (i32)* %callback\n}\ndefine void @"quoted (function)"() sanitize_address {\n ret void\n}\ndeclare void @external()\n';
  expect(prepareLLVMForAddressSanitizer(ir)).toBe(ir);
  expect(
    hasAddressSanitizer([
      "-fsanitize=address,undefined",
      "-fno-sanitize=address",
    ]),
  ).toBe(false);
  expect(hasAddressSanitizer(["-fno-sanitize=all", "-fsanitize=address"])).toBe(
    true,
  );
  const tagged = prepareLLVMForAddressSanitizer(ir, ["-fsanitize=address"]);
  expect(tagged).toContain(
    "define i32 @ordinary(i32 %sanitize_address) sanitize_address #0 !dbg !4 {",
  );
  expect(tagged).toContain(
    "define i32 (i32)* @factory(i32 (i32)* %callback) sanitize_address {",
  );
  expect(tagged).toContain(
    'define void @"quoted (function)"() sanitize_address {',
  );
  expect(tagged).toContain("declare void @external()");
  expect(prepareLLVMForAddressSanitizer(tagged, ["-fsanitize=address"])).toBe(
    tagged,
  );
  expect(
    prepareLLVMForAddressSanitizer(
      "define i32 @multiline(\ni32 %x\n) #0 {\nret i32 %x\n}",
      ["-fsanitize=address"],
    ),
  ).toContain(") sanitize_address #0 {");
});
const support = checkBplSanitizerSupport();
test.skipIf(!support.supported)(
  "ASan detects raw heap writes at both O0 and O3 instead of only linking its runtime",
  () => {
    for (const level of [0, 3] as const) {
      const result = runBplWithSanitizers(
        `extern malloc(size:long)ret *char;extern free(data:*char);extern write(fd:int,data:*char,size:long)ret long;
 frame main(argc:int,_argv:*string)ret int{local data:*char=malloc(1);data[argc+7]=42;write(1,data,1);free(data);return 0;}`,
        level,
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(
        "ERROR: AddressSanitizer: heap-buffer-overflow",
      );
    }
  },
  120000,
);

test("ASan stack guards probe the real stack without rewriting ordinary local allocations", () => {
  const ir = `define void @guarded() {
  %ordinary = alloca i8
  %probe = alloca i8
  %limit = load i8*, i8** @__bpl_stack_limit
  ret void
}
`;
  const tagged = prepareLLVMForAddressSanitizer(ir, ["-fsanitize=address"]);
  expect(tagged).toContain("%ordinary = alloca i8");
  expect(tagged).toContain("%probe = call i8* @llvm.stacksave()");
  expect(tagged.match(/declare i8\* @llvm\.stacksave\(\)/g)).toHaveLength(1);
  expect(prepareLLVMForAddressSanitizer(tagged, ["-fsanitize=address"])).toBe(
    tagged,
  );
  expect(prepareLLVMForAddressSanitizer(ir, ["-fsanitize=undefined"])).toBe(ir);
  const declared = "declare i8* @llvm.stacksave()\n" + ir;
  expect(
    prepareLLVMForAddressSanitizer(declared, ["-fsanitize=address"]).match(
      /declare i8\* @llvm\.stacksave\(\)/g,
    ),
  ).toHaveLength(1);
});

test.skipIf(!support.supported)(
  "optimized stack guards tolerate ASan stack-use-after-return instrumentation",
  () => {
    const result = runBplWithSanitizers(
      String.raw`
extern write(fd:int,data:*char,size:long)ret long;
@[noinline]
frame output(data:*char){write(1,data,1);}
@[noinline]
frame guarded(value:int)ret int{local bytes:char[64];bytes[0]='a';output(&bytes[0]);return value;}
frame main()ret int{local bytes:char[2050];bytes[0]='b';write(1,&bytes[0],1);local value:int=guarded(1);return guarded(value)-1;}
`,
      3,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("baa");
    expect(result.stderr).not.toContain("AddressSanitizer:");
  },
  90000,
);

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

import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import {
  expectCleanFailureSuite,
  expectCorrectnessSuite,
} from "./helpers/compilerCorrectness";

test("wide integer literals retain unsigned arithmetic and signed minimum negation", () => {
  expectCorrectnessSuite([
    {
      name: "integer-literal-bounds",
      validateLlvm: true,
      source: `extern printf(format:string,...)ret int;
frame main(){
 printf("%llu %llu %llu\\n",18446744073709551615/3,0xffffffffffffffff/3,9223372036854775808/2);
 printf("%ld %ld %ld\\n",-9223372036854775808/2,-(0x8000000000000000)/2,9223372036854775807/3);
 printf("%d %d %d\\n",18446744073709551615>0,9223372036854775808>0,-9223372036854775808<0);
 printf("%llu %llu %d\\n",0b1111111111111111111111111111111111111111111111111111111111111111/3,0o1777777777777777777777/3,cast<float>(18446744073709551615)>0.0);
}`,
      expectedStdout:
        "6148914691236517205 6148914691236517205 4611686018427387904\n-4611686018427387904 -4611686018427387904 3074457345618258602\n1 1 1\n6148914691236517205 6148914691236517205 1\n",
    },
  ]);
}, 60000);

test("integer literals larger than u64 fail before code generation or explicit casts", () => {
  expectCleanFailureSuite(
    [
      "18446744073709551616",
      "0x10000000000000000",
      "18_446_744_073_709_551_616",
      "0b10000000000000000000000000000000000000000000000000000000000000000",
      "0o2000000000000000000000",
    ].flatMap((literal, index) => [
      {
        name: `literal-overflow-${index}`,
        source: `frame main(){${literal};}`,
        expectedMessage:
          "Integer literal is outside the supported 64-bit range",
      },
      {
        name: `cast-literal-overflow-${index}`,
        source: `frame main()ret int{return cast<int>(${literal});}`,
        expectedMessage:
          "Integer literal is outside the supported 64-bit range",
      },
    ]),
  );
}, 60000);

test("out-of-range literals use the integer overflow diagnostic code", () => {
  const source = "frame main()ret int{return cast<int>(18446744073709551616);}";
  const parser = new Parser(
    source,
    "literal.bpl",
    lexWithGrammar(source, "literal.bpl"),
  );
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(parser.parse());
  expect(checker.getErrors().map((error) => error.code)).toContain(
    "BPL_INTEGER_LITERAL_OVERFLOW",
  );
});

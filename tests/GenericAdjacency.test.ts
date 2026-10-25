import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as peggy from "peggy";
import { generateBplParserSource } from "../tools/generate_peggy_parser";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function expression(source: string) {
  const program = new Parser(
    `frame main(){${source};}`,
    "generic-adjacency.bpl",
  ).parse();
  const fn = program.statements[0];
  if (fn?.kind !== "FunctionDecl") throw new Error("Expected function");
  const stmt = fn.body.statements[0];
  if (stmt?.kind !== "ExpressionStmt") throw new Error("Expected expression");
  return stmt.expression;
}

for (const trivia of [" ", "\t", "\n", "/# comparison #/"]) {
  // spec: R-FN-8
  test(`spaced angle arguments remain separate comparisons: ${JSON.stringify(trivia)}`, () => {
    const expr = expression(`consume(a${trivia}< b, c > (d))`);
    expect(expr.kind).toBe("Call");
    if (expr.kind !== "Call") throw new Error("Expected call");
    expect(expr.args).toHaveLength(2);
    expect(expr.args[0]).toMatchObject({
      kind: "Binary",
      operator: { lexeme: "<" },
    });
    expect(expr.args[1]).toMatchObject({
      kind: "Binary",
      operator: { lexeme: ">" },
    });
  });
}
for (const source of [
  "identity<int>",
  "module.identity<int>",
  "identity<Box<int>>(value)",
  "identity<int> (value)",
  "identity</# type #/ int>(value)",
]) {
  test(`adjacent generic syntax remains available: ${source}`, () => {
    const before = new Parser(
      `frame main(){${source};}`,
      "generic-reference.bpl",
    ).parse();
    const output = new Formatter().format(before);
    expect(
      formatterSemantics(new Parser(output, "generic-reference.bpl").parse()),
    ).toEqual(formatterSemantics(before));
    const expr = expression(source);
    expect(["Call", "GenericInstantiation"]).toContain(expr.kind);
  });
}
for (const source of [
  "frame identity <T>(value:T)ret T{return value;}",
  "struct Box <T>{value:T,}",
  "enum Option <T>{Some(T),None}",
  "spec Get <T>{frame get()ret T;}",
  "spec Get{frame get <T>()ret T;}",
  "type Items <T> = T[];",
  "frame main(){local item:Box<int>=Box <int>{value:1};}",
]) {
  test(`generic declarations and literals reject separated angle openers: ${source}`, () => {
    expect(() => new Parser(source, "spaced-generic.bpl").parse()).toThrow();
  });
}

for (const name of ["Func", "Lambda"])
  for (const trivia of [" ", "\t", "\n", "/# gap #/"]) {
    // spec: R-FN-8
    test(`callable type angle opener is adjacent: ${name} ${JSON.stringify(trivia)}`, () => {
      expect(() =>
        new Parser(
          `type Callback=${name}${trivia}<int>(int);`,
          "callable-adjacency.bpl",
        ).parse(),
      ).toThrow();
    });
  }

test("comparison arguments retain native behavior and formatter meaning at O0/O3", () => {
  const source = `import [printf] from "std/c.bpl";
frame identity<T>(value:T)ret T{return value;}
frame main()ret int{
 local a:int=1;local b:int=2;local c:int=4;local d:int=3;
 local callback:Func<int>(int)=identity<int>;
 printf("%d %d %d\\n",a < b,c > (d),callback(7));
 printf("[%d] [%d] [%d] [%d]\\n", a < b, a < c, 9, b >> 1);return 0;
}`;
  const before = new Parser(source, "comparison-arguments.bpl").parse();
  const output = new Formatter().format(before);
  expect(
    formatterSemantics(new Parser(output, "comparison-arguments.bpl").parse()),
  ).toEqual(formatterSemantics(before));
  expectCorrectnessSuite([
    {
      name: "original-comparison-arguments",
      source,
      expectedStdout: "1 1 7\n[1] [1] [9] [1]\n",
    },
    {
      name: "formatted-comparison-arguments",
      source: output,
      expectedStdout: "1 1 7\n[1] [1] [9] [1]\n",
    },
  ]);
}, 30000);

test("optimized postfix scanning agrees with its grammar production", () => {
  const grammar = readFileSync(
    join(import.meta.dir, "../grammar/bpl.peggy"),
    "utf8",
  );
  const raw = peggy.generate(grammar, {
    output: "source",
    format: "es",
    cache: false,
  });
  const tailPattern = /  function peg\$parsePostfixTail\(\) \{[\s\S]*?\n  \}/;
  const rawTail = raw.match(tailPattern)?.[0];
  const actionName = rawTail?.match(/s0 = (peg\$f\d+)\(s2\);/)?.[1];
  if (!rawTail || !actionName)
    throw new Error("Missing unoptimized postfix production");
  const action = raw.match(
    new RegExp(
      "  function " +
        actionName.replace("$", "\\$") +
        "\\(tail\\) \\{[\\s\\S]*?\\n  \\}",
    ),
  )?.[0];
  if (!action) throw new Error("Missing postfix action");
  // Keep the generator's shared location adapters: the grammar's AST helpers
  // require those independently of postfix parsing. Restore only this rule.
  const optimized = generateBplParserSource(grammar);
  expect(rawTail).toContain("peg$parsePostfixTrivia()");
  const baselineSource = optimized.replace(
    tailPattern,
    rawTail + "\n" + action,
  );
  expect(baselineSource).not.toBe(optimized);
  const executable = baselineSource.replace(
    /\nexport \{[\s\S]*?\n\};\s*$/,
    "\nreturn { parse: peg$parse };",
  );
  expect(executable).not.toContain("\nexport {");
  const baseline = new Function(executable)() as {
    parse(source: string, options: Record<string, unknown>): unknown;
  };
  const programs = [
    "frame main(){consume(a < b, c > (d));}",
    "frame main(){consume(a /# comparison #/ < b, c > (d));}",
    "frame main(){identity<int>;identity<int> (value);}",
    "struct Box<T>{value:T,} frame main(){local box:Box<int>=Box<int>{value:1};}",
  ];
  for (const source of programs) {
    const errors: unknown[] = [];
    const original = baseline.parse(source, {
      errors,
      filePath: "adjacency-parity.bpl",
    });
    expect(errors).toEqual([]);
    expect(formatterSemantics(original)).toEqual(
      formatterSemantics(new Parser(source, "adjacency-parity.bpl").parse()),
    );
  }
});

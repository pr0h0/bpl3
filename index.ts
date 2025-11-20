import { readFileSync, writeFileSync } from "fs";
import Lexer from "./lexer/lexer";
import { Parser } from "./parser/parser";
import AsmGenerator from "./transpiler/AsmGenerator";
import Scope from "./transpiler/Scope";

const argc = process.argv.length;
const argv = process.argv;

if (argc <= 2) {
  console.error("No file provided.");
  console.error("Usage: node index.ts <file>");
  process.exit(1);
}

const fileName = argv[2]!;
console.log(`Processing file: ${fileName}`);

const content = readFileSync(fileName, { encoding: "utf-8" });

const lexer = new Lexer(content);
const tokens = lexer.tokenize();

const parser = new Parser(tokens);
const ast = parser.parse();

// ast.log(0);

const generator = new AsmGenerator();
const globalScope = new Scope(); // Root scope

// Kick off the chain reaction
ast.transpile(generator, globalScope);

// Get the result
const assemblyCode = generator.build();
console.log(assemblyCode);

const outputFileName = fileName.replace(/\.[^/.]+$/, "") + ".asm";
writeFileSync(outputFileName, assemblyCode, { encoding: "utf-8" });
console.log(`Assembly code written to: ${outputFileName}`);

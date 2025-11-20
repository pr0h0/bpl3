import { readFileSync } from "fs";
import Lexer from "./lexer/lexer";
import { Parser } from "./parser/parser";

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

ast.log(0);

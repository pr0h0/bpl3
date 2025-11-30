import { parseFile } from "./utils/parser";
import { Formatter } from "./transpiler/formatter/Formatter";
import { readFile, saveToFile } from "./utils/file";
import { existsSync } from "fs";
import Lexer from "./lexer/lexer";
import TokenType from "./lexer/tokenType";

const args = process.argv.slice(2);
const files: string[] = [];
let write = false;
let ignoreUnknown = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!arg) continue;
  if (arg === "--write") {
    write = true;
  } else if (arg === "-u") {
    ignoreUnknown = true;
  } else {
    files.push(arg);
  }
}

if (files.length === 0) {
  console.error("No input files provided.");
  process.exit(1);
}

for (const file of files) {
  if (ignoreUnknown && !file.endsWith(".x")) {
    continue;
  }

  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    continue;
  }

  try {
    const originalContent = readFile(file);
    
    // Get comments
    const lexer = new Lexer(originalContent);
    const tokens = lexer.tokenize(true);
    const comments = tokens.filter((t) => t.type === TokenType.COMMENT);

    // Parse the file
    const program = parseFile(file);
    
    // Format the AST
    const formatter = new Formatter("    ", comments, originalContent);
    const formattedContent = formatter.format(program);

    // Check if content changed
    // We trim both to avoid issues with trailing newlines if any
    if (originalContent === formattedContent) {
       if (write) {
           console.log(`\x1b[90m${file} - unchanged\x1b[0m`);
       } else {
           // If not writing, we just output the formatted content
           // But if we have multiple files, concatenating them might be what is expected
           // or maybe just processing one by one.
           // Standard prettier outputs to stdout.
           console.log(formattedContent);
       }
    } else {
      if (write) {
        saveToFile(file, formattedContent);
        console.log(`${file} - changed`);
      } else {
        console.log(formattedContent);
      }
    }
  } catch (e: any) {
    console.error(`Error formatting ${file}: ${e.message}`);
  }
}

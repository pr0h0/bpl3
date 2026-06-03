import { dirname, join } from "path";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import * as peggy from "peggy";

const repoRoot = join(__dirname, "..");
const grammarPath = join(repoRoot, "grammar", "bpl.peggy");
const outputPath = join(
  repoRoot,
  "compiler",
  "frontend",
  "generated",
  "BplParser.js",
);

const grammarSource = readFileSync(grammarPath, "utf8");
const parserSource = peggy
  .generate(grammarSource, {
    output: "source",
    format: "es",
    cache: false,
  })
  .replace(/[ \t]+$/gm, "");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, parserSource);
console.log(`Generated ${outputPath}`);

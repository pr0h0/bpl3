import * as fs from "fs";
import * as path from "path";
import * as AST from "../common/AST";
import { DocParser } from "../common/DocParser";
import { Parser } from "../frontend/Parser";
import { lexWithGrammar } from "../frontend/GrammarLexer";
import { TypeUtils } from "../middleend/TypeUtils";

export class DocumentationGenerator {
  private visitedFiles = new Set<string>();
  private output: string[] = [];

  public generate(filePath: string): string {
    this.visitedFiles = new Set<string>();
    this.output = [];
    this.processFile(path.resolve(filePath));
    return this.output.join("\n");
  }

  private processFile(filePath: string) {
    const resolvedFilePath = this.resolveDocumentationFilePath(filePath);
    if (this.visitedFiles.has(resolvedFilePath)) return;
    this.visitedFiles.add(resolvedFilePath);

    const source = fs.readFileSync(resolvedFilePath, "utf-8");
    const tokens = lexWithGrammar(source, resolvedFilePath);
    const parser = new Parser(source, resolvedFilePath, tokens);

    // Parse without implicit imports to avoid cluttering docs with stdlib unless explicitly imported
    const ast = parser.parse(false);

    // Pass 1: Process imports recursively
    for (const stmt of ast.statements) {
      if (stmt.kind === "Import") {
        const importStmt = stmt as AST.ImportStmt;
        const dir = path.dirname(resolvedFilePath);
        const importPath = importStmt.source;

        // Simple resolution for relative paths
        if (importPath.startsWith(".")) {
          const resolved = path.resolve(dir, importPath);
          this.processFile(resolved);
        }
      }
    }

    // Pass 2: Generate documentation for this module
    const fileName = path.basename(resolvedFilePath);
    this.output.push(`# Module: ${fileName}`);
    this.output.push(`*File: ${resolvedFilePath}*\n`);

    // Group declarations
    const globals: AST.VariableDecl[] = [];
    const typeAliases: AST.TypeAliasDecl[] = [];
    const enums: AST.EnumDecl[] = [];
    const structs: AST.StructDecl[] = [];
    const specs: AST.SpecDecl[] = [];
    const functions: AST.FunctionDecl[] = [];

    for (const stmt of ast.statements) {
      if (stmt.kind === "VariableDecl" && (stmt as AST.VariableDecl).isGlobal) {
        globals.push(stmt as AST.VariableDecl);
      } else if (stmt.kind === "TypeAlias") {
        typeAliases.push(stmt as AST.TypeAliasDecl);
      } else if (stmt.kind === "EnumDecl") {
        enums.push(stmt as AST.EnumDecl);
      } else if (stmt.kind === "StructDecl") {
        structs.push(stmt as AST.StructDecl);
      } else if (stmt.kind === "SpecDecl") {
        specs.push(stmt as AST.SpecDecl);
      } else if (stmt.kind === "FunctionDecl") {
        functions.push(stmt as AST.FunctionDecl);
      }
    }

    // Document Globals
    if (globals.length > 0) {
      this.output.push("## Global Variables");
      for (const global of globals) {
        this.documentGlobal(global);
      }
      this.output.push("");
    }

    // Document Type Aliases
    if (typeAliases.length > 0) {
      this.output.push("## Type Aliases");
      for (const alias of typeAliases) {
        this.documentTypeAlias(alias);
      }
      this.output.push("");
    }

    // Document Enums
    if (enums.length > 0) {
      this.output.push("## Enums");
      for (const enumDecl of enums) {
        this.documentEnum(enumDecl);
      }
      this.output.push("");
    }

    // Document Specs
    if (specs.length > 0) {
      this.output.push("## Specs");
      for (const spec of specs) {
        this.documentSpec(spec);
      }
      this.output.push("");
    }

    // Document Structs
    if (structs.length > 0) {
      this.output.push("## Structs");
      for (const struct of structs) {
        this.documentStruct(struct);
      }
      this.output.push("");
    }

    // Document Functions
    if (functions.length > 0) {
      this.output.push("## Functions");
      for (const func of functions) {
        this.documentFunction(func);
      }
      this.output.push("");
    }

    this.output.push("---\n");
  }

  private resolveDocumentationFilePath(filePath: string): string {
    const candidates = [filePath, `${filePath}.bpl`, `${filePath}.x`];

    for (const candidate of candidates) {
      const stats = tryLstat(candidate);
      if (!stats) continue;

      if (stats.isSymbolicLink()) {
        throw new Error(`Documentation input is a symbolic link: ${candidate}`);
      }

      if (!stats.isFile()) {
        throw new Error(`Documentation input is not a file: ${candidate}`);
      }

      const symlinkedParent = findSymlinkedPathComponent(candidate);
      if (symlinkedParent) {
        throw new Error(
          `Documentation input parent contains a symbolic link: ${symlinkedParent}`,
        );
      }

      return candidate;
    }

    throw new Error(`Documentation input not found: ${filePath}`);
  }

  private documentGlobal(global: AST.VariableDecl) {
    let name = "";
    if (typeof global.name === "string") {
      name = global.name;
    } else {
      name = global.name.map((n) => n.name).join(", ");
    }

    const typeStr = global.typeAnnotation
      ? TypeUtils.typeToString(global.typeAnnotation)
      : "inferred";

    this.output.push(`### \`${name}\``);
    this.output.push("```bpl");
    this.output.push(`global ${name}: ${typeStr}`);
    this.output.push("```");

    if (global.documentation) {
      const parsed = DocParser.parse(global.documentation);
      this.output.push(parsed.description + "\n");
      for (const section of parsed.sections) {
        this.output.push(`#### ${section.title}`);
        this.output.push(section.content + "\n");
      }
    }
    this.output.push("");
  }

  private documentTypeAlias(alias: AST.TypeAliasDecl) {
    const typeStr = TypeUtils.typeToString(alias.type);
    let name = alias.name;
    if (alias.genericParams.length > 0) {
      name += `<${alias.genericParams.map((p) => p.name).join(", ")}>`;
    }

    this.output.push(`### \`${name}\``);
    this.output.push("```bpl");
    this.output.push(`type ${name} = ${typeStr}`);
    this.output.push("```");

    if (alias.documentation) {
      const parsed = DocParser.parse(alias.documentation);
      this.output.push(parsed.description + "\n");
      for (const section of parsed.sections) {
        this.output.push(`#### ${section.title}`);
        this.output.push(section.content + "\n");
      }
    }
    this.output.push("");
  }

  private documentFunction(func: AST.FunctionDecl, parentName?: string) {
    const fullName = parentName ? `${parentName}.${func.name}` : func.name;

    this.output.push(`### \`${fullName}\``);

    // Signature
    const params = func.params
      .map((p) => `${p.name}: ${TypeUtils.typeToString(p.type)}`)
      .join(", ");
    const ret = TypeUtils.typeToString(func.returnType);

    let genericStr = "";
    if (func.genericParams.length > 0) {
      genericStr = `<${func.genericParams.map((p) => p.name).join(", ")}>`;
    }

    const attrPrefix =
      func.attributes && func.attributes.length > 0
        ? `@[${func.attributes.map((attr) => attr.name).join(", ")}]\n`
        : "";

    this.output.push("```bpl");
    this.output.push(
      `${attrPrefix}frame ${func.name}${genericStr}(${params}) ret ${ret}`,
    );
    this.output.push("```");

    if (func.documentation) {
      const parsed = DocParser.parse(func.documentation);
      this.output.push(parsed.description + "\n");

      // Sections
      for (const section of parsed.sections) {
        this.output.push(`#### ${section.title}`);
        this.output.push(section.content + "\n");
      }
    }
    this.output.push("");
  }

  private documentStruct(struct: AST.StructDecl) {
    let name = struct.name;
    if (struct.genericParams.length > 0) {
      name += `<${struct.genericParams.map((p) => p.name).join(", ")}>`;
    }

    this.output.push(`### \`${name}\``);

    if (struct.documentation) {
      const parsed = DocParser.parse(struct.documentation);
      this.output.push(parsed.description + "\n");

      for (const section of parsed.sections) {
        this.output.push(`#### ${section.title}`);
        this.output.push(section.content + "\n");
      }
    }

    // Fields
    const fields = struct.members.filter(
      (m) => m.kind === "StructField",
    ) as AST.StructField[];
    if (fields.length > 0) {
      this.output.push("#### Fields");
      this.output.push("```bpl");
      for (const field of fields) {
        this.output.push(
          `${field.name}: ${TypeUtils.typeToString(field.type)}`,
        );
      }
      this.output.push("```\n");

      // Detailed field docs
      for (const field of fields) {
        if (field.documentation) {
          const parsed = DocParser.parse(field.documentation);
          this.output.push(`- **${field.name}**: ${parsed.description}`);
        }
      }
      this.output.push("");
    }

    // Methods
    const methods = struct.members.filter(
      (m) => m.kind === "FunctionDecl",
    ) as AST.FunctionDecl[];
    if (methods.length > 0) {
      this.output.push("#### Methods");
      for (const method of methods) {
        this.documentFunction(method, struct.name);
      }
    }
    this.output.push("");
  }

  private documentEnum(enumDecl: AST.EnumDecl) {
    let name = enumDecl.name;
    if (enumDecl.genericParams.length > 0) {
      name += `<${enumDecl.genericParams.map((p) => p.name).join(", ")}>`;
    }

    this.output.push(`### \`${name}\``);

    if (enumDecl.documentation) {
      const parsed = DocParser.parse(enumDecl.documentation);
      this.output.push(parsed.description + "\n");

      for (const section of parsed.sections) {
        this.output.push(`#### ${section.title}`);
        this.output.push(section.content + "\n");
      }
    }

    // Variants
    this.output.push("#### Variants");
    this.output.push("```bpl");
    for (const variant of enumDecl.variants) {
      let line = variant.name;
      if (variant.dataType) {
        if (variant.dataType.kind === "EnumVariantTuple") {
          const types = variant.dataType.types
            .map((t) => TypeUtils.typeToString(t))
            .join(", ");
          line += `(${types})`;
        } else if (variant.dataType.kind === "EnumVariantStruct") {
          const fields = variant.dataType.fields
            .map((f) => `${f.name}: ${TypeUtils.typeToString(f.type)}`)
            .join(", ");
          line += `{ ${fields} }`;
        }
      }
      this.output.push(line);
    }
    this.output.push("```\n");

    // Document methods
    if (enumDecl.methods.length > 0) {
      this.output.push("#### Methods");
      for (const method of enumDecl.methods) {
        this.documentFunction(method, enumDecl.name);
      }
    }
    this.output.push("");
  }

  private documentSpec(spec: AST.SpecDecl) {
    let name = spec.name;
    if (spec.genericParams.length > 0) {
      name += `<${spec.genericParams.map((p) => p.name).join(", ")}>`;
    }

    this.output.push(`### \`${name}\``);

    if (spec.documentation) {
      const parsed = DocParser.parse(spec.documentation);
      this.output.push(parsed.description + "\n");

      for (const section of parsed.sections) {
        this.output.push(`#### ${section.title}`);
        this.output.push(section.content + "\n");
      }
    }

    // Methods
    if (spec.methods.length > 0) {
      this.output.push("#### Required Methods");
      this.output.push("```bpl");
      for (const method of spec.methods) {
        const params = method.params
          .map((p) => `${p.name}: ${TypeUtils.typeToString(p.type)}`)
          .join(", ");
        const ret = method.returnType
          ? TypeUtils.typeToString(method.returnType)
          : "void";
        let genericStr = "";
        if (method.genericParams.length > 0) {
          genericStr = `<${method.genericParams.map((p) => p.name).join(", ")}>`;
        }
        this.output.push(
          `frame ${method.name}${genericStr}(${params}) ret ${ret}`,
        );
      }
      this.output.push("```\n");

      // Detailed method docs
      for (const method of spec.methods) {
        if (method.documentation) {
          const parsed = DocParser.parse(method.documentation);
          this.output.push(`- **${method.name}**: ${parsed.description}`);
        }
      }
    }
    this.output.push("");
  }
}

function findSymlinkedPathComponent(filePath: string): string | null {
  const absolutePath = path.resolve(filePath);
  const parsedPath = path.parse(absolutePath);
  const rootPath = parsedPath.root;
  const components = path
    .relative(rootPath, absolutePath)
    .split(/[\\/]+/)
    .filter(Boolean);
  let currentPath = rootPath;

  for (const component of components.slice(0, -1)) {
    currentPath = path.join(currentPath, component);
    const stats = tryLstat(currentPath);
    if (stats?.isSymbolicLink()) {
      return currentPath;
    }
  }

  return null;
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}

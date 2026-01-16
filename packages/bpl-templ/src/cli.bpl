#!/usr/bin/env bpl

import [Args] from "std/args.bpl";
import [FS] from "std/fs.bpl";
import [File] from "std/fs.bpl";
import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [StringUtils] from "std/string_utils.bpl";
import [Array] from "std/array.bpl";

extern printf(fmt: string, ...) ret int;
extern opendir(name: string) ret *void;
extern closedir(dir: *void) ret int;
extern exit(code: int) ret void;

struct TemplateCompiler {
    frame toPascalCase(str: String) ret String {
        local sb: StringBuilder = StringBuilder.new(str.length);
        local capitalizeNext: bool = true;
        local i: int = 0;
        local s: string = str.data;

        loop (i < str.length) {
            local c: char = s[i];
            # Check if alphanumeric a-z A-Z 0-9
            local isAlpha: bool = ((c >= cast<char>(97)) && (c <= cast<char>(122))) || ((c >= cast<char>(65)) && (c <= cast<char>(90))) || ((c >= cast<char>(48)) && (c <= cast<char>(57)));

            if (isAlpha) {
                if (capitalizeNext) {
                    if ((c >= cast<char>(97)) && (c <= cast<char>(122))) {
                        c = cast<char>(cast<int>(c) - 32); # to upper
                    }
                    capitalizeNext = false;
                }
                sb.appendChar(c);
            } else {
                capitalizeNext = true;
            }
            i = i + 1;
        }
        return String.new(sb.toString());
    }

    frame escapeString(input: String) ret String {
        local sb: StringBuilder = StringBuilder.new(input.length + 16);
        local i: int = 0;
        local s: string = input.data;

        loop (i < input.length) {
            local c: char = s[i];
            if (c == cast<char>(92)) {
                # \
                sb.append("\\\\");
            } else {
                if (c == cast<char>(34)) {
                    # "
                    sb.append("\\\"");
                } else {
                    if (c == cast<char>(10)) {
                        # \n
                        sb.append("\\n");
                    } else {
                        sb.appendChar(c);
                    }
                }
            }
            i = i + 1;
        }
        return String.new(sb.toString());
    }

    frame extractArgNames(signature: String) ret String {
        local sb: StringBuilder = StringBuilder.new(signature.length);
        local s: string = signature.data;
        local len: int = signature.length;
        local i: int = 0;
        local state: int = 0; # 0=NAME, 1=TYPE

        loop (i < len) {
            local c: char = s[i];

            if (state == 0) {
                # Reading name
                if (c == ':') {
                    state = 1; # Switch to skipping type
                } else {
                    sb.appendChar(c);
                }
            } else {
                # Skipping type look for comma
                if (c == ',') {
                    sb.append(", ");
                    state = 0; # Back to name
                }
            }
            i = i + 1;
        }
        return String.new(sb.toString());
    }

    frame compileTemplate(source: String, filename: String) ret String {
        printf("DEBUG: compileTemplate start\n");
        local base: String = Path.basename(filename.data);
        local baseStr: string = base.data;

        # Remove extension .bte
        local componentName: String = StringUtils.replace(baseStr, ".bte", "");
        local structName: String = TemplateCompiler.toPascalCase(componentName);
        printf("DEBUG: Struct name: %s\n", structName.data);

        local lines: Array<String> = source.split(cast<char>(10));
        printf("DEBUG: Split into %d lines\n", lines.length);
        local args: String = String.new("");
        local bodyLines: StringBuilder = StringBuilder.new(4096);
        local imports: StringBuilder = StringBuilder.new(1024);

        imports.append("import [StringBuilder] from \"std/string_builder.bpl\";\n");
        imports.append("import HTMLEscape_appendEscaped from \"bpl-templ\";\n");
        imports.append("extern free(ptr: *void);");

        local i: int = 0;

        # Header phase
        loop (i < lines.length) {
            local line: String = lines.get(i);
            printf("DEBUG: Processing line %d\n", i);
            if (line.data == nullptr) {
                printf("DEBUG: line.data is null\n");
            } else {
                printf("DEBUG: line content: '%s' (len %d)\n", line.data, line.length);
            }
            local trimmed: String = StringUtils.trim(line.data);
            printf("DEBUG: Trimmed line %d\n", i);
            local trimmedStr: string = trimmed.data;

            if (StringUtils.startsWith(trimmedStr, "@args")) {
                local k: int = 5;
                loop (k < trimmed.length) {
                    if (trimmedStr[k] != cast<char>(32)) 
                        break;
                    k = k + 1;
                }
                local sbArgs: StringBuilder = StringBuilder.new(64);
                loop (k < trimmed.length) {
                    sbArgs.appendChar(trimmedStr[k]);
                    k = k + 1;
                }
                args = String.new(sbArgs.toString());
                i = i + 1;
            } else {
                if (StringUtils.startsWith(trimmedStr, "@import")) {
                    local k: int = 7;
                    loop (k < trimmed.length) {
                        if (trimmedStr[k] != cast<char>(32)) 
                            break;
                        k = k + 1;
                    }
                    local sbImp: StringBuilder = StringBuilder.new(64);
                    sbImp.append("import ");
                    loop (k < trimmed.length) {
                        sbImp.appendChar(trimmedStr[k]);
                        k = k + 1;
                    }
                    sbImp.append(";\n");
                    imports.append(sbImp.toString());
                    i = i + 1;
                } else {
                    printf("DEBUG: Break header loop at line %d\n", i);
                    break;
                }
            }
        }

        # Buffer passed from parent
        printf("DEBUG: Entering body loop at %d\n", i);

        loop (i < lines.length) {
            local line: String = lines.get(i);
            printf("DEBUG: Processing body line %d\n", i);
            local trimmed: String = StringUtils.trim(line.data);
            local trimmedStr: string = trimmed.data;

            if (StringUtils.startsWith(trimmedStr, "@if")) {
                bodyLines.append("    ");
                local k: int = 1;
                loop (k < trimmed.length) {
                    bodyLines.appendChar(trimmedStr[k]);
                    k = k + 1;
                }
                if (trimmedStr[trimmed.length - 1] != cast<char>(123)) {
                    bodyLines.append(" {\n");
                } else {
                    bodyLines.append("\n");
                }
            } else {
                if (StringUtils.startsWith(trimmedStr, "@else")) {
                    bodyLines.append("    } else {\n");
                } else {
                    if (StringUtils.startsWith(trimmedStr, "@loop")) {
                        bodyLines.append("    ");
                        local k: int = 1;
                        loop (k < trimmed.length) {
                            bodyLines.appendChar(trimmedStr[k]);
                            k = k + 1;
                        }
                        if (trimmedStr[trimmed.length - 1] != cast<char>(123)) {
                            bodyLines.append(" {\n");
                        } else {
                            bodyLines.append("\n");
                        }
                    } else {
                        if (StringUtils.startsWith(trimmedStr, "@call")) {
                            local k: int = 5;
                            loop (k < trimmed.length) {
                                if (trimmedStr[k] != cast<char>(32)) 
                                    break;
                                k = k + 1;
                            }
                            bodyLines.append("    ");
                            loop (k < trimmed.length) {
                                bodyLines.appendChar(trimmedStr[k]);
                                k = k + 1;
                            }
                            bodyLines.append(";\n");
                        } else {
                            if (trimmed == "}") {
                                bodyLines.append("    }\n");
                            } else {
                                local lineStr: string = line.data;
                                local pos: int = 0;
                                local len: int = line.length;

                                loop (pos < len) {
                                    local nextTag: int = StringUtils.findString(lineStr, "{{", pos);
                                    if (nextTag == -1) {
                                        local sbRest: StringBuilder = StringBuilder.new(len - pos);
                                        local k: int = pos;
                                        loop (k < len) {
                                            sbRest.appendChar(lineStr[k]);
                                            k = k + 1;
                                        }
                                        if (sbRest.length > 0) {
                                            local esc: String = TemplateCompiler.escapeString(String.new(sbRest.toString()));
                                            bodyLines.append("    _sb.append(\"");
                                            bodyLines.append(esc.data);
                                            bodyLines.append("\");\n");
                                        }
                                        break;
                                    }
                                    if (nextTag > pos) {
                                        local sbPre: StringBuilder = StringBuilder.new(nextTag - pos);
                                        local k: int = pos;
                                        loop (k < nextTag) {
                                            sbPre.appendChar(lineStr[k]);
                                            k = k + 1;
                                        }
                                        local esc: String = TemplateCompiler.escapeString(String.new(sbPre.toString()));
                                        bodyLines.append("    _sb.append(\"");
                                        bodyLines.append(esc.data);
                                        bodyLines.append("\");\n");
                                    }
                                    local closePos: int = StringUtils.findString(lineStr, "}}", nextTag + 2);
                                    if (closePos == -1) {
                                        break;
                                    }
                                    local exprSb: StringBuilder = StringBuilder.new(closePos - (nextTag + 2));
                                    local m: int = nextTag + 2;
                                    loop (m < closePos) {
                                        exprSb.appendChar(lineStr[m]);
                                        m = m + 1;
                                    }
                                    local expr: String = StringUtils.trim(exprSb.toString());
                                    local exprStr: string = expr.data;

                                    if (StringUtils.startsWith(exprStr, "!")) {
                                        local rawExprSb: StringBuilder = StringBuilder.new(expr.length);
                                        local n: int = 1;
                                        loop (n < expr.length) {
                                            rawExprSb.appendChar(exprStr[n]);
                                            n = n + 1;
                                        }
                                        local rawExpr: String = StringUtils.trim(rawExprSb.toString());

                                        # Desugar .render(...) to .write(_sb, ...) for optimization
                                        local renderIdx: int = StringUtils.findString(rawExpr.data, ".render(", 0);
                                        if (renderIdx != -1) {
                                            local optimizedSb: StringBuilder = StringBuilder.new(rawExpr.length + 10);
                                            # Copy up to .render
                                            local k2: int = 0;
                                            loop (k2 < renderIdx) {
                                                optimizedSb.appendChar(rawExpr.data[k2]);
                                                k2 = k2 + 1;
                                            }
                                            optimizedSb.append(".write(_sb, ");
                                            # Copy remainder after .render(
                                            k2 = renderIdx + 8; # skip .render(
                                            loop (k2 < rawExpr.length) {
                                                optimizedSb.appendChar(rawExpr.data[k2]);
                                                k2 = k2 + 1;
                                            }
                                            bodyLines.append("    ");
                                            bodyLines.append(optimizedSb.toString());
                                            bodyLines.append(";\n");
                                        } else {
                                            bodyLines.append("    _sb.append(");
                                            bodyLines.append(rawExpr.data);
                                            bodyLines.append(");\n");
                                        }
                                    } else {
                                        bodyLines.append("    HTMLEscape_appendEscaped(_sb, ");
                                        bodyLines.append(exprStr);
                                        bodyLines.append(");\n");
                                    }

                                    pos = closePos + 2;
                                }

                                bodyLines.append("    _sb.append(\"\\n\");\n");
                            }
                        }
                    }
                }
            }

            i = i + 1;
        }

        local argsOnly: String = TemplateCompiler.extractArgNames(args);

        local finalSb: StringBuilder = StringBuilder.new(bodyLines.length + 1000);
        finalSb.append(imports.toString());
        finalSb.append("\nstruct ");
        finalSb.append(structName.data);
        finalSb.append(" {\n");

        # Write method (Buffer passing style)
        finalSb.append("  frame write(_sb: *StringBuilder, ");
        finalSb.append(args.data);
        finalSb.append(") {\n");
        finalSb.append(bodyLines.toString());
        finalSb.append("\n  }\n");

        # Render method (Wrapper)
        finalSb.append("  frame render(");
        finalSb.append(args.data);
        finalSb.append(") ret string {\n");
        finalSb.append("      local sb: StringBuilder = StringBuilder.new(1024);\n");
        finalSb.append("      ");
        finalSb.append(structName.data);
        finalSb.append(".write(&sb, ");
        finalSb.append(argsOnly.data);
        finalSb.append(");\n");
        finalSb.append("      return sb.toString();");
        finalSb.append("\n  }\n");

        finalSb.append("  frame free(str: string) {\n");
        finalSb.append("      if (str != nullptr) {\n");
        finalSb.append("          free(cast<*void>(str));\n");
        finalSb.append("      }\n");
        finalSb.append("  }\n");
        finalSb.append("}\n");
        finalSb.append("export [");
        finalSb.append(structName.data);
        finalSb.append("];\n");

        return String.new(finalSb.toString());
    }

    frame processDirectory(baseDir: String, currentDir: String, outputBase: String, ext: String) {
        printf("DEBUG: Processing dir: %s\n", currentDir.data);
        local entries: Array<String> = FS.listDir(currentDir.data);
        printf("DEBUG: Found %d entries\n", entries.length);
        local i: int = 0;
        loop (i < entries.length) {
            local entry: String = entries.get(i);
            printf("DEBUG: Entry: %s\n", entry.data);
            local fullPath: String = Path.join(currentDir.data, entry.data);

            local d: *void = opendir(fullPath.data);
            if (d != nullptr) {
                closedir(d);
                TemplateCompiler.processDirectory(baseDir, fullPath, outputBase, ext);
            } else {
                if (StringUtils.endsWith(entry.data, ".bte")) {
                    printf("DEBUG: Compiling %s\n", fullPath.data);
                    local content: String = FS.readFile(fullPath.data);
                    printf("DEBUG: Read file size: %d\n", content.length);
                    local generated: String = TemplateCompiler.compileTemplate(content, entry);
                    printf("DEBUG: Compiled template\n");

                    local relDir: String = Path.relative(baseDir.data, currentDir.data);
                    local outDir: String = Path.join(outputBase.data, relDir.data);

                    FS.mkdirp(outDir.data);

                    local outName: String = StringUtils.replace(entry.data, ".bte", ext.data);
                    local outPath: String = Path.join(outDir.data, outName.data);
                    printf("DEBUG: Writing to %s\n", outPath.data);

                    FS.writeFile(outPath.data, generated.data);

                    printf("  Processed %s -> %s\n", fullPath.data, outPath.data);
                }
            }

            i = i + 1;
        }
    }
}

frame main(argc: int, argv: *string) ret int {
    local args: Args = Args.new(argc, argv);

    local inputDir: String = String.new("");
    local outputDir: String = String.new("");
    local ext: String = String.new(".bpl");

    if (args.count() < 2) {
        printf("Usage: bpl-templ generate <dir> [-o <out>] [--ext <ext>]\n");
        return 1;
    }
    local cmd: String = args.get(1);
    if (!(cmd == "generate")) {
        printf("Unknown command: %s\n", cmd.data);
        return 1;
    }
    local i: int = 2;
    loop (i < args.count()) {
        local arg: String = args.get(i);
        local s: string = arg.data;
        local consume: int = 0;

        if (s[0] == cast<char>(45)) {
            if ((arg == "-o") || (arg == "--out")) {
                if ((i + 1) < args.count()) {
                    outputDir = args.get(i + 1);
                    consume = 1;
                }
            } else {
                if (arg == "--ext") {
                    if ((i + 1) < args.count()) {
                        ext = args.get(i + 1);
                        consume = 1;
                    }
                }
            }
        } else {
            if (inputDir.length == 0) {
                inputDir = arg;
            }
        }
        i = i + 1 + consume;
    }

    if (inputDir.length == 0) {
        printf("Missing input directory\n");
        return 1;
    }
    if (outputDir.length == 0) {
        outputDir = inputDir;
    }
    printf("Compiling templates from %s to %s...\n", inputDir.data, outputDir.data);

    TemplateCompiler.processDirectory(inputDir, inputDir, outputDir, ext);

    return 0;
}

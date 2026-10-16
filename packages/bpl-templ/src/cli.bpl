#!/usr/bin/env bpl

import [Args] from "std/args.bpl";
import [FS] from "std/fs.bpl";
import [File] from "std/fs.bpl";
import [IOError] from "std/errors.bpl";
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
        local cleanup_sb: *StringBuilder = &sb;
        defer cleanup_sb.destroy();
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
        local cleanup_sb: *StringBuilder = &sb;
        defer cleanup_sb.destroy();
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
                    if (c == cast<char>(13)) {
                        sb.append("\\r");
                    } else if (c == cast<char>(9)) {
                        sb.append("\\t");
                    } else if (c == cast<char>(10)) {
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

    frame interpolationEnd(text: string, start: int, length: int) ret int {
        local pos: int = start;
        local quote: char = 0;
        local braces: int = 0;
        local interpolationDepths: Array<int> = Array<int>.new(0);
        local depthsOwner: *Array<int> = &interpolationDepths;
        defer depthsOwner.destroy();
        loop (pos < length) {
            local c: char = text[pos];
            if (quote != 0) {
                if (c == 92) {
                    pos = pos + 1;
                    if (pos >= length) { return -1; }
                } else if ((quote == 96) && (c == '$') && ((pos + 1) < length) && (text[pos + 1] == '{')) {
                    braces = braces + 1;
                    interpolationDepths.push(braces);
                    quote = 0;
                    pos = pos + 1;
                } else if (c == quote) {
                    quote = 0;
                }
            } else if ((c == 34) || (c == 39) || (c == 96)) {
                quote = c;
            } else if (c == '{') {
                braces = braces + 1;
            } else if (c == '}') {
                if (braces > 0) {
                    if ((interpolationDepths.len() > 0) && (interpolationDepths.get(interpolationDepths.len() - 1) == braces)) {
                        interpolationDepths.pop();
                        quote = 96;
                    }
                    braces = braces - 1;
                } else if (((pos + 1) < length) && (text[pos + 1] == '}')) {
                    return pos;
                }
            }
            pos = pos + 1;
        }
        return -1;
    }

    frame extractArgNames(signature: String) ret String {
        local sb: StringBuilder = StringBuilder.new(signature.length);
        local cleanup_sb: *StringBuilder = &sb;
        defer cleanup_sb.destroy();
        local s: string = signature.data;
        local len: int = signature.length;
        local i: int = 0;
        local state: int = 0; # 0=NAME, 1=TYPE
        local depth: int = 0;

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
                if (c == '<' || c == '(' || c == '[') { depth = depth + 1; }
                if (c == '>' || c == ')' || c == ']') { depth = depth - 1; }
                if (c == ',' && depth == 0) {
                    sb.append(", ");
                    state = 0; # Back to name
                }
            }
            i = i + 1;
        }
        return String.new(sb.toString());
    }

    frame compileTemplate(source: String, filename: String) ret String {

        local base: String = Path.basename(filename.data);

        local cleanup_base: *String = &base;

        defer cleanup_base.destroy();

        # Remove extension .bte
        local componentName: String = base.substring(0, base.length - 4);
        local cleanup_componentName: *String = &componentName;
        defer cleanup_componentName.destroy();
        local structName: String = TemplateCompiler.toPascalCase(componentName);
        local cleanup_structName: *String = &structName;
        defer cleanup_structName.destroy();
        if(structName.length == 0 || (structName.data[0] >= '0' && structName.data[0] <= '9')) {throw "Template filename must produce a valid identifier";}


        local lines: Array<String> = source.split(cast<char>(10));
        defer {loop(local cleanup:int=0;cleanup<lines.len();cleanup=cleanup+1){local item:String=lines.get(cleanup);item.destroy();}lines.destroy();}

        local args: String = String.new("");

        local cleanup_args: *String = &args;

        defer cleanup_args.destroy();
        local bodyLines: StringBuilder = StringBuilder.new(4096);
        local cleanup_bodyLines: *StringBuilder = &bodyLines;
        defer cleanup_bodyLines.destroy();
        local imports: StringBuilder = StringBuilder.new(1024);
        local cleanup_imports: *StringBuilder = &imports;
        defer cleanup_imports.destroy();

        imports.append("import [StringBuilder] from \"std/string_builder.bpl\";\n");
        imports.append("import HTMLEscape_appendEscaped from \"bpl-templ\";\n");
        imports.append("extern free(ptr: *void);");

        local i: int = 0;

        # Header phase
        loop (i < lines.length) {
            local line: String = lines.get(i);

            if (line.data == nullptr) {

            } else {

            }
            local trimmed: String = line.trim();
            local cleanup_trimmed: *String = &trimmed;
            defer cleanup_trimmed.destroy();

            local trimmedStr: string = trimmed.data;

            if (StringUtils.startsWith(trimmedStr, "@args")) {
                local k: int = 5;
                loop (k < trimmed.length) {
                    if (trimmedStr[k] != cast<char>(32)) 
                        break;
                    k = k + 1;
                }
                local sbArgs: StringBuilder = StringBuilder.new(64);
                local cleanup_sbArgs: *StringBuilder = &sbArgs;
                defer cleanup_sbArgs.destroy();
                loop (k < trimmed.length) {
                    sbArgs.appendChar(trimmedStr[k]);
                    k = k + 1;
                }
                args.destroy(); args = String.new(sbArgs.toString());
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
                    local cleanup_sbImp: *StringBuilder = &sbImp;
                    defer cleanup_sbImp.destroy();
                    sbImp.append("import ");
                    loop (k < trimmed.length) {
                        sbImp.appendChar(trimmedStr[k]);
                        k = k + 1;
                    }
                    sbImp.append(";\n");
                    imports.append(sbImp.toString());
                    i = i + 1;
                } else {

                    break;
                }
            }
        }

        # Buffer passed from parent


        loop (i < lines.length) {
            local line: String = lines.get(i);

            local trimmed: String = line.trim();

            local cleanup_trimmed: *String = &trimmed;

            defer cleanup_trimmed.destroy();
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
                if (StringUtils.startsWith(trimmedStr, "@else") || StringUtils.startsWith(trimmedStr, "} @else")) {
                    bodyLines.append("    } ");
                    local k: int = 1;
                    if (StringUtils.startsWith(trimmedStr, "} @else")) { k = 3; }
                    loop (k < trimmed.length) {bodyLines.appendChar(trimmedStr[k]);k = k + 1;}
                    if (trimmedStr[trimmed.length - 1] != '{') {bodyLines.append(" {\n");}
                    else {bodyLines.append("\n");}
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
                                        local cleanup_sbRest: *StringBuilder = &sbRest;
                                        defer cleanup_sbRest.destroy();
                                        local k: int = pos;
                                        loop (k < len) {
                                            sbRest.appendChar(lineStr[k]);
                                            k = k + 1;
                                        }
                                        if (sbRest.length > 0) {
                                            local fragment: String = String.new(sbRest.toString());
                                            local fragmentOwner: *String = &fragment;
                                            defer fragmentOwner.destroy();
                                            local esc: String = TemplateCompiler.escapeString(fragment);
                                            local cleanup_esc: *String = &esc;
                                            defer cleanup_esc.destroy();
                                            bodyLines.append("    _sb.append(\"");
                                            bodyLines.append(esc.data);
                                            bodyLines.append("\");\n");
                                        }
                                        break;
                                    }
                                    if (nextTag > pos) {
                                        local sbPre: StringBuilder = StringBuilder.new(nextTag - pos);
                                        local cleanup_sbPre: *StringBuilder = &sbPre;
                                        defer cleanup_sbPre.destroy();
                                        local k: int = pos;
                                        loop (k < nextTag) {
                                            sbPre.appendChar(lineStr[k]);
                                            k = k + 1;
                                        }
                                        local fragment: String = String.new(sbPre.toString());
                                        local fragmentOwner: *String = &fragment;
                                        defer fragmentOwner.destroy();
                                        local esc: String = TemplateCompiler.escapeString(fragment);
                                        local cleanup_esc: *String = &esc;
                                        defer cleanup_esc.destroy();
                                        bodyLines.append("    _sb.append(\"");
                                        bodyLines.append(esc.data);
                                        bodyLines.append("\");\n");
                                    }
                                    local closePos: int = TemplateCompiler.interpolationEnd(lineStr, nextTag + 2, len);
                                    if (closePos == -1) { throw "Unclosed template interpolation"; }
                                    local exprSb: StringBuilder = StringBuilder.new(closePos - (nextTag + 2));
                                    local cleanup_exprSb: *StringBuilder = &exprSb;
                                    defer cleanup_exprSb.destroy();
                                    local m: int = nextTag + 2;
                                    loop (m < closePos) {
                                        exprSb.appendChar(lineStr[m]);
                                        m = m + 1;
                                    }
                                    local expr: String = StringUtils.trim(exprSb.toString());
                                    local cleanup_expr: *String = &expr;
                                    defer cleanup_expr.destroy();
                                    local exprStr: string = expr.data;
                                    if(expr.length == 0) {throw "Empty template interpolation";}

                                    if (StringUtils.startsWith(exprStr, "!")) {
                                        local rawExprSb: StringBuilder = StringBuilder.new(expr.length);
                                        local cleanup_rawExprSb: *StringBuilder = &rawExprSb;
                                        defer cleanup_rawExprSb.destroy();
                                        local n: int = 1;
                                        loop (n < expr.length) {
                                            rawExprSb.appendChar(exprStr[n]);
                                            n = n + 1;
                                        }
                                        local rawExpr: String = StringUtils.trim(rawExprSb.toString());
                                        local cleanup_rawExpr: *String = &rawExpr;
                                        defer cleanup_rawExpr.destroy();

                                        if(rawExpr.length == 0) {throw "Empty raw template interpolation";}
                                        bodyLines.append("    _sb.append(");
                                        bodyLines.append(rawExpr.data);
                                        bodyLines.append(");\n");
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

        local cleanup_argsOnly: *String = &argsOnly;

        defer cleanup_argsOnly.destroy();

        local finalSb: StringBuilder = StringBuilder.new(bodyLines.length + 1000);

        local cleanup_finalSb: *StringBuilder = &finalSb;

        defer cleanup_finalSb.destroy();
        finalSb.append(imports.toString());
        finalSb.append("\nstruct ");
        finalSb.append(structName.data);
        finalSb.append(" {\n");

        # Write method (Buffer passing style)
        finalSb.append("  frame write(_sb: *StringBuilder");
        if(args.length > 0) {finalSb.append(", "); finalSb.append(args.data);}
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
        finalSb.append(".write(&sb");
        if(argsOnly.length > 0) {finalSb.append(", "); finalSb.append(argsOnly.data);}
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

        local entries: Array<String> = FS.listDirChecked(currentDir.data);
        defer {loop(local cleanup:int=0;cleanup<entries.len();cleanup=cleanup+1){local item:String=entries.get(cleanup);item.destroy();}entries.destroy();}

        local i: int = 0;
        loop (i < entries.length) {
            local entry: String = entries.get(i);

            local fullPath: String = Path.join(currentDir.data, entry.data);

            local cleanup_fullPath: *String = &fullPath;

            defer cleanup_fullPath.destroy();

            local d: *void = opendir(fullPath.data);
            if (d != nullptr) {
                closedir(d);
                TemplateCompiler.processDirectory(baseDir, fullPath, outputBase, ext);
            } else {
                if (StringUtils.endsWith(entry.data, ".bte")) {

                    local content: String = FS.readFile(fullPath.data);

                    local cleanup_content: *String = &content;

                    defer cleanup_content.destroy();

                    local generated: String = TemplateCompiler.compileTemplate(content, entry);

                    local cleanup_generated: *String = &generated;

                    defer cleanup_generated.destroy();


                    local relDir: String = Path.relative(baseDir.data, currentDir.data);


                    local cleanup_relDir: *String = &relDir;


                    defer cleanup_relDir.destroy();
                    local outDir: String = Path.join(outputBase.data, relDir.data);
                    local cleanup_outDir: *String = &outDir;
                    defer cleanup_outDir.destroy();

                    if (!FS.mkdirp(outDir.data)) {
                        throw "Cannot create template output directory";
                    }

                    local stem: String = entry.substring(0, entry.length - 4);
                    local stemOwner: *String = &stem;
                    defer stemOwner.destroy();
                    local outName: String = stem + ext;

                    local cleanup_outName: *String = &outName;

                    defer cleanup_outName.destroy();
                    local outPath: String = Path.join(outDir.data, outName.data);
                    local cleanup_outPath: *String = &outPath;
                    defer cleanup_outPath.destroy();


                    if (!FS.writeFile(outPath.data, generated.data)) {
                        throw "Cannot write generated template";
                    }

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
    local inputOwner: *String = &inputDir;
    defer inputOwner.destroy();
    local outputDir: String = String.new("");
    local outputOwner: *String = &outputDir;
    defer outputOwner.destroy();
    local ext: String = String.new(".bpl");
    local extOwner: *String = &ext;
    defer extOwner.destroy();

    if (args.count() < 2) {
        printf("Usage: bpl-templ generate <dir> [-o <out>] [--ext <ext>]\n");
        return 1;
    }
    local cmd: String = args.get(1);
    local commandOwner: *String = &cmd;
    defer commandOwner.destroy();
    if (!(cmd == "generate")) {
        printf("Unknown command: %s\n", cmd.data);
        return 1;
    }
    local i: int = 2;
    loop (i < args.count()) {
        local arg: String = args.get(i);
        local argumentOwner: *String = &arg;
        defer argumentOwner.destroy();
        local s: string = arg.data;
        local consume: int = 0;
        if (s[0] == '-') {
            if (!(arg == "-o") && !(arg == "--out") && !(arg == "--ext")) {
                printf("Unknown option: %s\n", s);
                return 1;
            }
            if ((i + 1) >= args.count()) {
                printf("Missing value for %s\n", s);
                return 1;
            }
            local value: String = args.get(i + 1);
            local valueOwner: *String = &value;
            defer valueOwner.destroy();
            if ((value.length == 0) || (value.data[0] == '-')) {
                printf("Missing value for %s\n", s);
                return 1;
            }
            if (arg == "--ext") {
                ext.assign(value.data);
            } else {
                outputDir.assign(value.data);
            }
            consume = 1;
        } else if (inputDir.length == 0) {
            inputDir.assign(s);
        } else {
            printf("Unexpected argument: %s\n", s);
            return 1;
        }
        i = i + 1 + consume;
    }
    if (inputDir.length == 0) {
        printf("Missing input directory\n");
        return 1;
    }
    if (outputDir.length == 0) {
        outputDir.destroy();
        outputDir = String.new(inputDir.data);
    }
    printf("Compiling templates from %s to %s...\n", inputDir.data, outputDir.data);
    try {
        TemplateCompiler.processDirectory(inputDir, inputDir, outputDir, ext);
    } catch (error: IOError) {
        printf("Template I/O error: %s\n", error.message);
        return 1;
    } catch (error: string) {
        printf("Template generation error: %s\n", error);
        return 1;
    } catch {
        printf("Template generation failed\n");
        return 1;
    }
    return 0;
}

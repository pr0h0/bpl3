# Diagnostics module for error reporting

export [Span];
export [DiagnosticLevel];
export [Diagnostic];
export [DiagnosticReporter];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [CharUtils] from "std/char_utils.bpl";

extern printf(fmt: string, ...) ret int;

struct Span {
    file: String,
    # Filename
    start: int,
    # Start index (byte offset)
    end: int,
    # End index
    line: int,
    # Line number (1-based)
    col: int,
    # Column number (1-based)

    frame new(file: string, start: int, end: int, line: int, col: int) ret Span {
        local s: Span;
        s.file = String.new(file);
        s.start = start;
        s.end = end;
        s.line = line;
        s.col = col;
        return s;
    }

    frame destroy(this: *Span) {
        this.file.destroy();
    }
}

enum DiagnosticLevel {
    Error,
    Warning,
    Info,
}

struct Diagnostic {
    level: DiagnosticLevel,
    message: String,
    span: Span,

    frame new(level: DiagnosticLevel, msg: string, span: Span) ret Diagnostic {
        local d: Diagnostic;
        d.level = level;
        d.message = String.new(msg);
        d.span = span; # Copies span struct, but span contains String which is a pointer + len. Deep copy?
        # Span has String field which should be cloned if we want to own it properly.
        d.span.file = span.file.clone();
        return d;
    }

    frame destroy(this: *Diagnostic) {
        this.message.destroy();
        this.span.destroy();
    }
}

struct DiagnosticReporter {
    diagnostics: Array<Diagnostic>,

    frame new() ret DiagnosticReporter {
        local r: DiagnosticReporter;
        r.diagnostics = Array<Diagnostic>.new(16);
        return r;
    }

    frame report(this: *DiagnosticReporter, level: DiagnosticLevel, msg: string, span: Span) {
        local d: Diagnostic = Diagnostic.new(level, msg, span);
        this.diagnostics.push(d);
    }

    frame printAll(this: *DiagnosticReporter, source: string) {
        local i: int = 0;
        loop (i < this.diagnostics.length) {
            local d: Diagnostic = this.diagnostics.get(i);
            this._printOne(&d, source);
            i = i + 1;
        }
    }

    frame _printOne(this: *DiagnosticReporter, d: *Diagnostic, source: string) {
        # Header: file:line:col: Level: Message
        local levelColor: string = "\u001b[31m"; # Red for error
        local levelText: string = "error";

        match (d.level) {
            DiagnosticLevel.Error => {
                levelColor = "\u001b[31m";
                levelText = "error";
            },
            DiagnosticLevel.Warning => {
                levelColor = "\u001b[33m";
                levelText = "warning";
            },
            DiagnosticLevel.Info => {
                levelColor = "\u001b[34m";
                levelText = "info";
            },
        };

        # Access data from String objects using .data since they are strings inside the struct
        printf("\u001b[1m%s:%d:%d: %s%s\u001b[0m: %s\n", d.span.file.data, d.span.line, d.span.col, levelColor, levelText, d.message.data);

        # Source snippet
        if (source != nullptr) {
            this._printSnippet(d.span.line, d.span.col, d.span.start, d.span.end, source);
        }
    }

    frame _printSnippet(this: *DiagnosticReporter, line: int, col: int, start: int, end: int, source: string) {
        # Find start of line
        local lineStart: int = 0;
        local currentLine: int = 1;
        local i: int = 0;

        loop {
            if (currentLine == line) {
                lineStart = i;
                break;
            }
            if (source[i] == 0) 
                break;
            # Null terminator
            if (source[i] == 10) {
                # Newline
                currentLine = currentLine + 1;
            }
            i = i + 1;
        }

        # Find end of line
        local lineEnd: int = lineStart;
        loop {
            if (source[lineEnd] == 0) 
                break;
            if (source[lineEnd] == 10) 
                break;
            lineEnd = lineEnd + 1;
        }

        # Print line number padding
        printf(" %d | ", line);

        # Print source line
        local k: int = lineStart;
        loop (k < lineEnd) {
            printf("%c", source[k]);
            k = k + 1;
        }
        printf("\n");

        # Print underline
        # Padding for line number
        printf("     | ");

        # Spaces until column
        local j: int = 1;
        loop (j < col) {
            printf(" ");
            j = j + 1;
        }

        printf("\u001b[31m"); # Red
        local len: int = end - start;
        if (len < 1) 
            len = 1;
        local m: int = 0;
        loop (m < len) {
            printf("^");
            m = m + 1;
        }
        printf("\u001b[0m\n");
    }

    frame destroy(this: *DiagnosticReporter) {
        local i: int = 0;
        loop (i < this.diagnostics.length) {
            local d: *Diagnostic = this.diagnostics.getRef(i);
            d.destroy();
            i = i + 1;
        }
        this.diagnostics.destroy();
    }
}

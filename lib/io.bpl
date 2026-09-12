# IO utilities
import [String] from "std/string.bpl";
import [Any] from "std/type.bpl";
export [IO];
export [LineReadResult];

extern printf(fmt: string, ...) ret int;
extern scanf(fmt: string, ...) ret int;
extern __bpl_read_line(buf: string, capacity: int, length: *int) ret int;
extern strlen(s: string) ret int;

extern write(fd: int, buf: *char, count: int) ret int;
extern dprintf(fd: int, fmt: *char, ...) ret int;

# Line and Truncated contain the number of stored bytes, excluding NUL/newline.
enum LineReadResult {
    Line(int),
    Truncated(int),
    EndOfFile,
    Error,
    InvalidBuffer,
}

/#
# Input/Output Utilities
Provides standard IO operations like printing and reading input.
#/
struct IO {
    /#
    # Print Formatted
    Wrapper around C printf.
    #/
    frame printf(format: string, a0: int) ret int {
        return printf(format, a0);
    }

    /#
    # Read Formatted
    Wrapper around C scanf.
    #/
    frame read(format: string, ptr: *void) ret int {
        return scanf(format, ptr);
    }

    /#
    # Print Integer
    Prints an integer without appending a newline.
    #/
    frame printInt(n: int) {
        printf("%d", n);
    }

    /#
    # Print Integer (Line)
    Prints an integer followed by a newline.
    #/
    frame printIntLn(n: int) {
        printf("%d\n", n);
    }

    /#
    # Print String (No Newline)
    Prints a raw string without appending a newline.
    #/
    frame print(s: string) {
        printf("%s", s);
    }

    /#
    # Print String (Line)
    Prints a raw string followed by a newline.
    #/
    frame printString(s: string) {
        printf("%s\n", s);
    }

    /#
    # Print String Object
    Prints a String object followed by a newline.
    #/
    frame printString(s: String) {
        printf("%s\n", s.toString());
    }

    /#
    # Log Message
    Alias for printString.
    #/
    frame log(msg: string) {
        printf("%s\n", msg);
    }

    /#
    # Print Float
    Prints a float without appending a newline.
    #/
    frame printFloat(f: float) {
        printf("%f", f);
    }

    /#
    # Print Float (Line)
    Prints a float followed by a newline.
    #/
    frame printFloatLn(f: float) {
        printf("%f\n", f);
    }

    /#
    # Print Bool
    Prints a boolean as "true" or "false" without appending a newline.
    #/
    frame printBool(b: bool) {
        if (b) {
            printf("true");
        } else {
            printf("false");
        }
    }

    /#
    # Print Bool (Line)
    Prints a boolean as "true" or "false" followed by a newline.
    #/
    frame printBoolLn(b: bool) {
        if (b) {
            printf("true\n");
        } else {
            printf("false\n");
        }
    }

    /#
    Read a line into a caller-owned buffer with capacity including its NUL byte.
    Removes LF, preserves other bytes, and drains excess input through LF/EOF.
    Valid buffers are always NUL-terminated. Invalid buffers consume no input.
    #/
    frame readLine(buf: string, capacity: int) ret LineReadResult {
        local length: int = 0;
        local status: int = __bpl_read_line(buf, capacity, &length);
        if (status == 0) { return LineReadResult.Line(length); }
        if (status == 1) { return LineReadResult.EndOfFile; }
        if (status == 2) { return LineReadResult.Truncated(length); }
        if (status == 4) { return LineReadResult.InvalidBuffer; }
        return LineReadResult.Error;
    }

    frame bpl_printf(fmt: string, args: *Any, args_count: int) {
        local i: int = 0;
        local arg_idx: int = 0;
        local len: int = strlen(fmt);

        loop (i < len) {
            local c: char = fmt[i];
            if (c == '%') {
                i = i + 1;
                if (i >= len) {
                    break;
                }
                local specs: char = fmt[i];

                if (specs == 's') {
                    if (arg_idx < args_count) {
                        local arg: Any = args[arg_idx];
                        local s: *char = cast<*char>(arg.data);
                        write(1, s, strlen(s));
                        arg_idx = arg_idx + 1;
                    }
                } else if (specs == 'd') {
                    if (arg_idx < args_count) {
                        local arg: Any = args[arg_idx];
                        local val: int = cast<int>(arg.data);
                        dprintf(1, "%d", val);
                        arg_idx = arg_idx + 1;
                    }
                } else if (specs == 'l') {
                    if (arg_idx < args_count) {
                        local arg: Any = args[arg_idx];
                        local val: u64 = arg.data;
                        dprintf(1, "%lld", val);
                        arg_idx = arg_idx + 1;
                    }
                } else {
                    write(1, &specs, 1);
                }
            } else {
                write(1, &c, 1);
            }
            i = i + 1;
        }
    }
}

# IO utilities
import [String] from "std/string.bpl";
import [Any] from "std/type.bpl";
export [IO];

extern printf(fmt: string, ...) ret int;
extern scanf(fmt: string, ...) ret int;
extern gets(buf: string) ret string;
extern strlen(s: string) ret int;

extern write(fd: int, buf: *char, count: int) ret int;
extern dprintf(fd: int, fmt: *char, ...) ret int;

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
    Prints an integer followed by a newline.
    #/
    frame printInt(n: int) {
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
    Prints a float followed by a newline.
    #/
    frame printFloat(f: float) {
        printf("%f\n", f);
    }

    /#
    # Print Bool
    Prints a boolean as "true" or "false" followed by a newline.
    #/
    frame printBool(b: bool) {
        if (b) {
            printf("true\n");
        } else {
            printf("false\n");
        }
    }

    /#
    # Read Line
    Reads a line from stdin into the buffer.

    ## Returns
    The length of the string read.
    #/
    frame readLine(buf: string) ret int {
        gets(buf);
        return strlen(buf);
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

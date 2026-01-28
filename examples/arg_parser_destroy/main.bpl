# Test that ParsedArgs.destroy() properly frees memory without crashing

import [ParsedArgs] from "std/arg_parser.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;
extern free(ptr: *void) ret void;

frame main() ret int {
    # Create and populate ParsedArgs
    local args: *ParsedArgs = ParsedArgs.new();

    # Add multiple flags
    args.setFlag(String.new("verbose"), String.new("true"));
    args.setFlag(String.new("output"), String.new("file.txt"));
    args.setFlag(String.new("count"), String.new("42"));

    # Update an existing flag (this was previously causing issues)
    args.setFlag(String.new("output"), String.new("newfile.txt"));

    # Verify flags exist
    if (args.hasFlag("verbose")) {
        printf("verbose: OK\n");
    }
    if (args.hasFlag("output")) {
        printf("output: OK\n");
    }
    if (args.hasFlag("count")) {
        printf("count: OK\n");
    }
    # This was previously crashing due to BUG-114 (nullptr comparison with vtable structs)
    args.destroy();
    free(cast<*void>(args));

    printf("destroy: OK\n");
    return 0;
}

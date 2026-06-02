import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [ArgParser], [Command], [ParsedArgs] from "std/arg_parser.bpl";
import [Option] from "std/option.bpl";
import [Args] from "std/args.bpl";

import [printf] from "std/c.bpl";
import [atoi] from "std/c.bpl";
import [strcmp] from "std/c.bpl";
import [malloc] from "std/c.bpl";
import [free] from "std/c.bpl";

frame main(argc: int, argv: **char) ret int {
    local root: *Command = Command.new("calc", "CLI Calculator");

    # Subcommands
    local addCmd: *Command = Command.new("add", "Add numbers");
    root.addSubcommand(addCmd);

    local subCmd: *Command = Command.new("sub", "Subtract numbers (from first)");
    root.addSubcommand(subCmd);

    local mulCmd: *Command = Command.new("mul", "Multiply numbers");
    root.addSubcommand(mulCmd);

    local divCmd: *Command = Command.new("div", "Divide numbers (first / rest)");
    root.addSubcommand(divCmd);

    local parser: ArgParser = ArgParser.new(root);
    local args: Args = Args.new(argc, argv);
    local parsed: *ParsedArgs = parser.parse(&args);

    local pathLen: int = parsed.commandPath.len();

    if (pathLen > 1) {
        local cmdNameStr: *String = parsed.commandPath.get(pathLen - 1);
        local cmdName: string = cmdNameStr.data;

        local result: int = 0;
        local count: int = parsed.positional.len();

        if (count == 0) {
            printf("Error: No operands provided\n");
            return 1;
        }
        local firstStr: *String = parsed.positional.get(0);
        local firstVal: int = atoi(firstStr.data);

        if (strcmp(cmdName, "add") == 0) {
            result = 0;
            local i: int = 0;
            loop (i < count) {
                local s: *String = parsed.positional.get(i);
                result = result + atoi(s.data);
                i = i + 1;
            }
        } else if (strcmp(cmdName, "sub") == 0) {
            result = firstVal;
            local i: int = 1;
            loop (i < count) {
                local s: *String = parsed.positional.get(i);
                result = result - atoi(s.data);
                i = i + 1;
            }
        } else if (strcmp(cmdName, "mul") == 0) {
            result = firstVal;
            local i: int = 1;
            loop (i < count) {
                local s: *String = parsed.positional.get(i);
                result = result * atoi(s.data);
                i = i + 1;
            }
        } else if (strcmp(cmdName, "div") == 0) {
            result = firstVal;
            local i: int = 1;
            loop (i < count) {
                local s: *String = parsed.positional.get(i);
                local val: int = atoi(s.data);
                if (val == 0) {
                    printf("Error: Division by zero\n");
                    return 1;
                }
                result = result / val;
                i = i + 1;
            }
        } else {
            printf("Unknown command: %s\n", cmdName);
        }

        printf("%d\n", result);
    } else {
        root.printHelp();
    }

    parsed.destroy();
    free(cast<*void>(parsed));
    root.destroy();
    free(cast<*void>(root));

    return 0;
}

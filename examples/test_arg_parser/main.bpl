import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [ArgParser], [Argument], [Command], [Flag], [ParsedArgs] from "std/arg_parser.bpl";
import [Option] from "std/option.bpl";
import [Args] from "std/args.bpl";

import [printf] from "std/c.bpl";

import [malloc] from "std/c.bpl";
import [free] from "std/c.bpl";

frame main(argc: int, argv: **char) ret int {
    local root: *Command = Command.new("compiler", "The BPL Compiler");

    # Global flags
    local verboseFlag: *Flag = Flag.new("--verbose", "-v", "Enable verbose output", false);
    root.addFlag(verboseFlag);

    local versionFlag: *Flag = Flag.new("--version", "-V", "Print version info", false);
    root.addFlag(versionFlag);

    local helpFlag: *Flag = Flag.new("--help", "-h", "Show help output", false);
    root.addFlag(helpFlag);

    # Subcommand: build
    local buildCmd: *Command = Command.new("build", "Build the project");
    local releaseFlag: *Flag = Flag.new("--release", "-r", "Build in release mode", false);
    buildCmd.addFlag(releaseFlag);
    local outputFlag: *Flag = Flag.new("--output", "-o", "Output file path", true);
    buildCmd.addFlag(outputFlag);

    local targetArg: *Argument = Argument.new("target", "Target architecture (x86_64, arm64)", false);
    buildCmd.addArgument(targetArg);

    root.addSubcommand(buildCmd);

    # Subcommand: run
    local runCmd: *Command = Command.new("run", "Build and run the project");
    # runCmd.addFlag(releaseFlag); # Reusing flags causes double free
    local releaseFlagRun: *Flag = Flag.new("--release", "-r", "Run in release mode", false);
    runCmd.addFlag(releaseFlagRun);

    root.addSubcommand(runCmd);

    # Subcommand: install
    local installCmd: *Command = Command.new("install", "Install the binary");
    local pathFlag: *Flag = Flag.new("--path", "-p", "Install path", true);
    installCmd.addFlag(pathFlag);
    root.addSubcommand(installCmd);

    local parser: ArgParser = ArgParser.new(root);

    # Use real args
    local args: Args = Args.new(argc, argv);
    local parsed: *ParsedArgs = parser.parse(&args);

    if (parsed.hasFlag("--help")) {
        root.printHelp();
    } else {
        printf("Command path length: %d\n", parsed.commandPath.length);
        if (parsed.hasFlag("--verbose")) {
            printf("Verbose mode enabled\n");
        }
        # Check command specific flags
        if (parsed.hasFlag("--release")) {
            printf("Release mode enabled\n");
        }
        local outputOpt: Option<*String> = parsed.getFlag("--output");
        match (outputOpt) {
            Option.Some(val) => {
                printf("Output file: %s\n", val.data);
            },
            Option.None => {
            },
        };
        local pathOpt: Option<*String> = parsed.getFlag("--path");
        match (pathOpt) {
            Option.Some(val) => {
                printf("Install path: %s\n", val.data);
            },
            Option.None => {
            },
        };
        # Check subcommands
        local i: int = 0;
        loop (i < parsed.commandPath.len()) {
            printf("Path[%d]: %s\n", i, parsed.commandPath.get(i).data);
            i = i + 1;
        }
    }

    parsed.destroy();
    free(cast<*void>(parsed));

    # Clean up root and its children
    root.destroy();
    free(cast<*void>(root));
    return 0;
}

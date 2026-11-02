import printf from "std/c.bpl";
import [ArgParser], [Command], [Flag], [ParsedArgs] from "std/arg_parser.bpl";
import [Args] from "std/args.bpl";

frame main(argc: int, argv: **char) ret int {
    local root: *Command = Command.new("tool", "Typed flag values");
    root.addFlag(Flag.new("--jobs", "-j", "Parallel jobs", true));
    root.addFlag(Flag.new("--limit", "-l", "Byte limit", true));
    root.addFlag(Flag.new("--ratio", "-r", "Sampling ratio", true));
    root.addFlag(Flag.new("--name", "-n", "A text flag", true));
    local parser: ArgParser = ArgParser.new(root);
    local args: Args = Args.new(argc, argv);
    local parsed: *ParsedArgs = parser.parse(&args);

    local jobs: int = 1;
    local limit: long = 0;
    local ratio: float = 0.0;
    local unused: int = -1;
    printf("jobs %d %d\n", cast<int>(parsed.flagInt("--jobs", &jobs)), jobs);
    printf("limit %d %ld\n", cast<int>(parsed.flagLong("--limit", &limit)), limit);
    printf("ratio %d %g\n", cast<int>(parsed.flagFloat("--ratio", &ratio)), ratio);
    printf("name as int %d %d\n", cast<int>(parsed.flagInt("--name", &unused)), unused);
    printf("missing %d %d\n", cast<int>(parsed.flagInt("--absent", &unused)), unused);

    parsed.destroy();
    parser.destroy();
    return 0;
}

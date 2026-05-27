import { describe, expect, it } from "bun:test";

import { compileAndRunFull } from "./helpers";

const ARG_PARSER_PROGRAM = `
  import [Args] from "std/args.bpl";
  import [ArgParser], [Command], [Flag], [ParsedArgs] from "std/arg_parser.bpl";
  import [Option] from "std/option.bpl";
  import [String] from "std/string.bpl";

  extern printf(fmt: string, ...) ret int;
  extern free(ptr: *void) ret void;

  frame main(argc: int, argv: **char) ret int {
    local root: *Command = Command.new("tool", "test parser");
    root.addFlag(Flag.new("--output", "-o", "output path", true));
    root.addFlag(Flag.new("--verbose", "-v", "verbose mode", false));

    local rawArgs: Args = Args.new(argc, argv);
    local parser: ArgParser = ArgParser.new(root);
    local parsed: *ParsedArgs = parser.parse(&rawArgs);

    local outputOpt: Option<*String> = parsed.getFlag("--output");
    match (outputOpt) {
      Option.Some(value) => {
        printf("output:%s\\n", value.data);
      },
      Option.None => {},
    };

    local outputAliasOpt: Option<*String> = parsed.getFlag("-o");
    match (outputAliasOpt) {
      Option.Some(value) => {
        printf("alias:%s\\n", value.data);
      },
      Option.None => {},
    };

    local verboseOpt: Option<*String> = parsed.getFlag("--verbose");
    match (verboseOpt) {
      Option.Some(value) => {
        printf("verbose:%s\\n", value.data);
      },
      Option.None => {},
    };

    parsed.destroy();
    free(cast<*void>(parsed));
    root.destroy();
    free(cast<*void>(root));
    return 0;
  }
`;

function runArgParser(args: string[]) {
  return compileAndRunFull(ARG_PARSER_PROGRAM, { args: ["--", ...args] });
}

describe("ArgParser", () => {
  it("parses long flag values from --flag=value", () => {
    const result = runArgParser(["--output=file.txt"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("output:file.txt\n");
  });

  it("parses alias flag values from -f=value", () => {
    const result = runArgParser(["-o=alias.txt"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("output:alias.txt\n");
    expect(result.stdout).toContain("alias:alias.txt\n");
  });

  it("preserves empty values from --flag=", () => {
    const result = runArgParser(["--output="]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("output:\n");
  });

  it("rejects explicit values for boolean flags", () => {
    const result = runArgParser(["--verbose=true"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Error: Flag --verbose does not take a value.");
    expect(result.stdout).not.toContain("verbose:true\n");
  });
});

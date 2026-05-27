# CLI Command Parser
# Allows defining commands, subcommands, arguments, and flags.

export [Command];
export [Flag];
export [Argument];
export [ArgParser];
export [ParsedArgs];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
import [StringUtils] from "std/string_utils.bpl";
import [Args] from "std/args.bpl";
import [Destructible] from "std/core_specs.bpl";

extern printf(fmt: string, ...) ret int;
extern sprintf(buf: string, fmt: string, ...) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memset(ptr: *void, val: int, size: long) ret *void;
extern strcmp(s1: string, s2: string) ret int;

# Helper for allocation
frame alloc<T>() ret *T {
    return cast<*T>(malloc(sizeof<T>()));
}

frame alloc_with_vtable<T>(dummy: *T) ret *T {
    local ptr: *T = alloc<T>();

    # Copy vtable (first 8 bytes)
    local vtable_ptr: *long = cast<*long>(dummy);
    local vtable: long = vtable_ptr[0];
    local ptr_long: *long = cast<*long>(ptr);
    ptr_long[0] = vtable;

    # Zero out dummy fields to prevent destructor crashes
    # Skip 8 bytes (vtable)
    local dummy_addr: long = cast<long>(cast<*void>(dummy));
    local fields_start: *void = cast<*void>(dummy_addr + 8);

    local size: long = sizeof<T>() - 8;
    if (size > 0) {
        memset(fields_start, 0, size);
    }
    return ptr;
}

struct Flag {
    name: String,
    alias: String,
    description: String,
    hasValue: bool,
    defaultValue: String,
    # e.g., "--verbose" or "-v"

    # e.g., "-v"

    # if true, expects a value after the flag

    # default value if not provided (optional)

    frame new(name: string, alias: string, desc: string, hasVal: bool) ret *Flag {
        local dummy: Flag;
        local f: *Flag = alloc_with_vtable<Flag>(&dummy);
        f.name = String.new(name);
        if (alias != nullptr) {
            f.alias = String.new(alias);
        } else {
            f.alias = String.new(nullptr);
        }
        f.description = String.new(desc);
        f.hasValue = hasVal;
        f.defaultValue = String.new(nullptr);
        return f;
    }

    frame withDefault(this: *Flag, val: string) ret *Flag {
        this.defaultValue.assign(val);
        return this;
    }

    frame destroy(this: *Flag) {
        this.name.destroy();
        this.alias.destroy();
        this.description.destroy();
        this.defaultValue.destroy();
        # Self free? Usually caller frees the pointer if they alloc'd it.
        # But if we treat this as "destructor for the object at ptr", we assume ownership of fields.
        # We will manually free the struct pointer after calling destroy in the container.
    }
}

struct Argument {
    name: String,
    description: String,
    required: bool,
    frame new(name: string, desc: string, required: bool) ret *Argument {
        local dummy: Argument;
        local a: *Argument = alloc_with_vtable<Argument>(&dummy);
        a.name = String.new(name);
        a.description = String.new(desc);
        a.required = required;
        return a;
    }

    frame destroy(this: *Argument) {
        this.name.destroy();
        this.description.destroy();
    }
}

struct Command {
    name: String,
    description: String,
    flags: Array<*Flag>,
    arguments: Array<*Argument>,
    subcommands: Array<*Command>,
    action: Func<int>(*ParsedArgs),
    # Return exit code (0 = success)

    frame new(name: string, desc: string) ret *Command {
        local dummy: Command;
        local c: *Command = alloc_with_vtable<Command>(&dummy);
        c.name = String.new(name);
        c.description = String.new(desc);
        c.flags = Array<*Flag>.new(4);
        c.arguments = Array<*Argument>.new(4);
        c.subcommands = Array<*Command>.new(4);

        # Initialize with null/empty check handle
        # Explicitly setting action to a valid but empty handler would be better
        # For now, just ensure it's not random garbage if possible, though assignment
        # of uninit var might be the issue.
        # We can't assign 'null' to Func type unless it's nullable or handled.
        # Let's rely on users calling setAction.

        return c;
    }

    frame addFlag(this: *Command, flag: *Flag) ret *Command {
        this.flags.push(flag);
        return this;
    }

    frame addArgument(this: *Command, arg: *Argument) ret *Command {
        this.arguments.push(arg);
        return this;
    }

    frame addSubcommand(this: *Command, cmd: *Command) ret *Command {
        this.subcommands.push(cmd);
        return this;
    }

    frame setAction(this: *Command, fn: Func<int>(*ParsedArgs)) ret *Command {
        this.action = fn;
        return this;
    }

    frame printHelp(this: *Command) {
        printf("%s: %s\n\n", this.name.data, this.description.data);
        printf("Usage: %s [options] [command]\n\n", this.name.data);

        local i: int = 0;
        if (this.arguments.len() > 0) {
            printf("Arguments:\n");
            i = 0;
            loop (i < this.arguments.len()) {
                local a: *Argument = this.arguments.get(i);
                # Use strict format with fixed spacing manually if needed, or printf width
                printf("  %-12s %s\n", a.name.data, a.description.data);
                i = i + 1;
            }
            printf("\n");
        }
        if (this.subcommands.len() > 0) {
            printf("Commands:\n");
            i = 0;
            loop (i < this.subcommands.len()) {
                local c: *Command = this.subcommands.get(i);
                printf("  %-12s %s\n", c.name.data, c.description.data);
                i = i + 1;
            }
            printf("\n");
        }
        if (this.flags.len() > 0) {
            printf("Options:\n");
            i = 0;
            loop (i < this.flags.len()) {
                local f: *Flag = this.flags.get(i);
                # Format: -s, --long  Desc
                if (!f.alias.isEmpty()) {
                    local buf: string = malloc(100);
                    sprintf(buf, "%s, %s", f.alias.data, f.name.data);
                    printf("  %-18s %s\n", buf, f.description.data);
                    free(buf);
                } else {
                    printf("  %-18s %s\n", f.name.data, f.description.data);
                }
                i = i + 1;
            }
            printf("\n");
        }
    }

    frame destroy(this: *Command) {
        this.name.destroy();
        this.description.destroy();

        # Destroy items
        local i: int = 0;
        loop (i < this.flags.len()) {
            local f: *Flag = this.flags.get(i);
            f.destroy();
            free(cast<*void>(f));
            i = i + 1;
        }
        this.flags.destroy();

        i = 0;
        loop (i < this.arguments.len()) {
            local a: *Argument = this.arguments.get(i);
            a.destroy();
            free(cast<*void>(a));
            i = i + 1;
        }
        this.arguments.destroy();

        i = 0;
        loop (i < this.subcommands.len()) {
            local c: *Command = this.subcommands.get(i);
            c.destroy();
            free(cast<*void>(c));
            i = i + 1;
        }
        this.subcommands.destroy();
    }
}

struct FlagEntry {
    key: *String,
    value: *String,
}

struct ParsedArgs: Destructible {
    commandPath: Array<*String>,
    flags: Array<*FlagEntry>,
    positional: Array<*String>,
    frame new() ret *ParsedArgs {
        local dummy: ParsedArgs;
        local pa: *ParsedArgs = alloc_with_vtable<ParsedArgs>(&dummy);
        pa.commandPath = Array<*String>.new(4);
        pa.flags = Array<*FlagEntry>.new(8);
        pa.positional = Array<*String>.new(8);
        return pa;
    }

    frame setFlag(this: *ParsedArgs, key: String, value: String) {
        local i: int = 0;
        loop (i < this.flags.len()) {
            local entry: *FlagEntry = this.flags.get(i);
            if (strcmp(entry.key.data, key.data) == 0) {
                entry.value.destroy();
                *entry.value = String.new(value.data);
                return;
            }
            i = i + 1;
        }
        local newEntry: *FlagEntry = alloc<FlagEntry>();
        newEntry.key = alloc<String>();
        *newEntry.key = String.new(key.data);
        newEntry.value = alloc<String>();
        *newEntry.value = String.new(value.data);

        this.flags.push(newEntry);
    }

    frame getFlag(this: *ParsedArgs, name: string) ret Option<*String> {
        local i: int = 0;
        loop (i < this.flags.len()) {
            local entry: *FlagEntry = this.flags.get(i);
            if (strcmp(entry.key.data, name) == 0) {
                return Option<*String>.Some(entry.value);
            }
            i = i + 1;
        }
        return Option<*String>.None;
    }

    frame hasFlag(this: *ParsedArgs, name: string) ret bool {
        local i: int = 0;
        loop (i < this.flags.len()) {
            local entry: *FlagEntry = this.flags.get(i);
            if (strcmp(entry.key.data, name) == 0) {
                return true;
            }
            i = i + 1;
        }
        return false;
    }

    frame getArg(this: *ParsedArgs, index: int) ret Option<*String> {
        if (index < this.positional.len()) {
            return Option<*String>.Some(this.positional.get(index));
        }
        return Option<*String>.None;
    }

    frame destroy(this: *ParsedArgs) {
        local i: int = 0;
        loop (i < this.commandPath.len()) {
            local s: *String = this.commandPath.get(i);
            s.destroy();
            free(cast<*void>(s));
            i = i + 1;
        }
        this.commandPath.destroy();

        i = 0;
        loop (i < this.flags.len()) {
            local entry: *FlagEntry = this.flags.get(i);
            # Note: key and value are always allocated in setFlag, so no nullptr check needed.
            # Avoiding ptr != nullptr comparison due to compiler bug with vtable structs (BUG-114).
            entry.key.destroy();
            free(cast<*void>(entry.key));
            entry.value.destroy();
            free(cast<*void>(entry.value));
            free(cast<*void>(entry));
            i = i + 1;
        }
        this.flags.destroy();

        i = 0;
        loop (i < this.positional.len()) {
            local s: *String = this.positional.get(i);
            s.destroy();
            free(cast<*void>(s));
            i = i + 1;
        }
        this.positional.destroy();
    }
}

struct ArgParser {
    root: *Command,
    frame new(rootCmd: *Command) ret ArgParser {
        local ap: ArgParser;
        ap.root = rootCmd;
        return ap;
    }

    # Matches a raw string arg against a flag definition
    frame matchFlag(this: *ArgParser, currentCmd: *Command, argStr: string) ret Option<*Flag> {
        local i: int = 0;
        local flags: *Array<*Flag> = &currentCmd.flags;
        loop (i < flags.len()) {
            local f: *Flag = flags.get(i);
            # Check full name
            if (StringUtils.startsWith(argStr, f.name.data)) {
                # Exact match or starts with (for --flag=value)
                return Option<*Flag>.Some(f);
            }
            # Check alias
            if (!f.alias.isEmpty()) {
                if (StringUtils.startsWith(argStr, f.alias.data)) {
                    return Option<*Flag>.Some(f);
                }
            }
            i = i + 1;
        }
        return Option<*Flag>.None;
    }

    frame parse(this: *ArgParser, args: *Args) ret *ParsedArgs {
        local parsed: *ParsedArgs = ParsedArgs.new();
        local currentCmd: *Command = this.root;

        local rootName: *String = alloc<String>();
        *rootName = currentCmd.name.clone();
        parsed.commandPath.push(rootName);

        local i: int = 1; # Skip executable name (argv[0])
        local argCount: int = args.count();

        loop (i < argCount) {
            local rawArg: String = args.get(i);
            local argStr: string = rawArg.data;

            # 1. Check if it's a subcommand
            local isSubCmd: bool = false;
            local j: int = 0;
            loop (j < currentCmd.subcommands.len()) {
                local sub: *Command = currentCmd.subcommands.get(j);
                if (rawArg == sub.name) {
                    currentCmd = sub; # Switch context

                    local subName: *String = alloc<String>();
                    *subName = sub.name.clone();
                    parsed.commandPath.push(subName);

                    isSubCmd = true;
                    break;
                }
                j = j + 1;
            }

            if (isSubCmd) {
                i = i + 1;
                continue;
            }
            # 2. Check if it is a flag
            if (StringUtils.startsWith(argStr, "-")) {
                local flagOpt: Option<*Flag> = this.matchFlag(currentCmd, argStr);
                match (flagOpt) {
                    Option.Some(flag) => {
                        # Handle flag
                        local val: String;
                        local shouldSet: bool = true;

                        local eqIdx: int = StringUtils.find(argStr, cast<char>(61)); # '='
                        if (eqIdx != -1) {
                            if (flag.hasValue) {
                                val = rawArg.substring(eqIdx + 1, rawArg.length - eqIdx - 1);
                            } else {
                                printf("Error: Flag %s does not take a value.\n", flag.name.data);
                                val = String.new("");
                                shouldSet = false;
                            }
                        } else {
                            if (flag.hasValue) {
                                i = i + 1;
                                if (i < argCount) {
                                    val = args.get(i);
                                } else {
                                    printf("Error: Flag %s requires a value.\n", flag.name.data);
                                    val = String.new("");
                                }
                            } else {
                                val = String.new("true");
                            }
                        }

                        if (shouldSet) {
                            if (!flag.alias.isEmpty()) {
                                parsed.setFlag(flag.name.clone(), val.clone());
                                parsed.setFlag(flag.alias.clone(), val);
                            } else {
                                parsed.setFlag(flag.name.clone(), val);
                            }
                        }
                    },
                    Option.None => {
                        printf("Unknown flag: %s\n", argStr);
                    },
                };
            } else {
                # 3. Positional Argument
                local posArg: *String = alloc<String>();
                *posArg = rawArg.clone();
                parsed.positional.push(posArg);
            }

            i = i + 1;
        }

        return parsed;
    }
}

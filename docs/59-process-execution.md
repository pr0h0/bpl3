# Process Execution

The `std/process.bpl` module runs other programs. `run` and `runWith` start a program directly, without a shell, and capture its stdout and stderr separately; `runWith` also feeds stdin and enforces a timeout. Prefer them for new code. The older helpers go through `/bin/sh`: `exec`, `execSilent`, `execStatus`, and `execOutput` accept command arguments separately, and `execShell` accepts one raw shell command. `sleep` accepts milliseconds.

**Argument handling (shell helpers):** The argument-based shell helpers quote each argument for a POSIX shell. This protects argument boundaries and shell metacharacters; it does not validate the executable, reject options such as `--delete`, or restrict what the child process can access. `execShell` performs no such quoting. These helpers do not provide timeouts, separate stderr, or stdin; use `runWith` for those. No helper provides process isolation or output limits.

The status-returning functions and `ProcessResult.exitCode` report the application
exit code (0–255), `128 + signal` when the waited-for shell is terminated by a
signal, or `-1` when starting/waiting fails. They do not expose the encoded POSIX
wait status. A shell may itself translate a child signal into a normal exit code.

## Import

```bpl
import run, runWith, [RunResult] from "std/process.bpl";
import exec, execStatus, execOutput, [ProcessResult] from "std/process.bpl";
```

## Running programs without a shell

```bpl
frame run(args: ...string, count: int) ret RunResult
frame runWith(input: string, timeoutMs: int, args: ...string, count: int) ret RunResult

struct RunResult {
    exitCode: int,      # 0-255, 128 + signal, or -1 when it could not start
    timedOut: bool,
    stdout: String,     # exact bytes; `length` counts them
    stderr: String,
}
```

`args[0]` is looked up on `PATH` and every argument reaches the program
unchanged, so there is nothing to quote and no shell injection. Stdin is
`/dev/null` for `run`; `runWith` writes `input` (unless it is `nullptr`) and then
closes stdin. Output is read while input is written, so large inputs and outputs
cannot deadlock, and a program that stops reading its input early does not kill
the caller with `SIGPIPE`.

With `timeoutMs > 0`, the program runs in its own process group. When the
timeout expires the whole group, grandchildren included, is killed with
`SIGKILL`; `timedOut` is then true, `exitCode` is 137, and the output read so far
is kept. Without a timeout, `run` waits until the program and anything it left
running have closed stdout and stderr.

When the program cannot be started, `exitCode` is `-1` and `stderr` holds the
reason, such as `No such file or directory`. Destroy both strings when done.
Output size is not limited. `run` and `runWith` use `posix_spawn` from the
native runtime and are available on Linux and macOS only, not on Windows or
WebAssembly targets.

```bpl
import printf from "std/c.bpl";
import run, runWith, [RunResult] from "std/process.bpl";

frame main() ret int {
    local listing: RunResult = run("ls", "-1", "/");
    printf("exit %d\n%s", listing.exitCode, listing.stdout.data);
    listing.stdout.destroy();
    listing.stderr.destroy();

    local sorted: RunResult = runWith("b\na\n", 1000, "sort");
    printf("%s", sorted.stdout.data);
    sorted.stdout.destroy();
    sorted.stderr.destroy();
    return 0;
}
```

## API Reference

### Structs

#### `ProcessResult`

Holds the result of a process execution that captures output.

```bpl
struct ProcessResult {
    exitCode: int,      # The exit status code of the process
    output: String      # The captured standard output
}
```

### Safety and Injection Protection

The argument-based helpers quote shell arguments; `execShell` does not.

```bpl
# The semicolon stays inside a single argument.
# The shell receives: 'echo' 'hello; echo INJECTED'
# Output is literal "hello; echo INJECTED"
exec("echo", "hello; echo INJECTED");
```

### Functions

The argument-based execution functions accept variadic `string` arguments plus the required trailing `count: int` parameter in their declarations. Callers pass only the command arguments; the compiler supplies `count` automatically. Arguments are joined by spaces to form the shell command string, and each argument is automatically escaped (wrapped in single quotes with internal escaping) to preserve shell argument boundaries.

#### `exec`

Executes a shell command and waits for it to complete. This function returns nothing and ignores the exit code.

```bpl
frame exec(args: ...string, count: int)
```

- **Parameters**:
  - `args`: Components of the command line.

#### `execShell`

Executes a command string directly without any escaping. This is useful for pipelines, redirects, and environment variables but requires caution. It captures standard output.

```bpl
frame execShell(cmd: string) ret ProcessResult
```

- **Parameters**:
  - `cmd`: The raw command string.
- **Returns**: A `ProcessResult` struct containing the `exitCode` and `output`.
- **Warning**: This function is vulnerable to command injection if passed untrusted input.

#### `execSilent`

Executes a command with quoted arguments but redirects both stdout and stderr to `/dev/null`. Useful for checking if a command works without cluttering the output.

```bpl
frame execSilent(args: ...string, count: int) ret int
```

- **Parameters**:
  - `args`: Components of the command line.
- **Returns**: The exit status code.

#### `sleep`

Pauses execution for the specified nonnegative number of milliseconds.
Interrupted waits resume for the remaining duration. Negative inputs and native
wait failures throw. Millisecond scaling uses 64-bit arithmetic, including waits
longer than 35 minutes.

```bpl
frame sleep(ms: int)
```

#### `execStatus`

Executes a command with quoted arguments and returns its exit status code.

```bpl
frame execStatus(args: ...string, count: int) ret int
```

#### `execOutput`

Executes a shell command, captures its standard output, and returns both the exit code and the output.

```bpl
frame execOutput(args: ...string, count: int) ret ProcessResult
```

- **Parameters**:
  - `args`: Components of the command line.
- **Returns**: A `ProcessResult` struct containing the `exitCode` and `output`.

> **Note**: The `output` field in `ProcessResult` is a `String` object. Call `result.output.destroy()` when finished, including when the command fails.

## Examples

### Running a Command

Pass the executable as the first argument and each command argument separately.
A single argument containing spaces is one executable name, not a parsed command
line. Use `execShell` when shell parsing is intended.

**Best Practice:** Pass the command and its arguments as separate parameters.

```bpl
import exec, execShell, execSilent, [ProcessResult] from "std/process.bpl";

frame main() {
    # Preferred: Separate arguments
    # Safety: "bpl_test" and "/tmp/..." are escaped, preventing injection
    exec("mkdir", "-p", "/tmp/bpl_test");

    # Using shell features (piping) - USE execShell
    local result: ProcessResult = execShell("ls -la | grep bpl");
    result.output.destroy();

    # Silent check
    if (execSilent("which", "git") == 0) {
        # git is installed
    }
}
```

### Checking Exit Status

Useful for control flow based on command success.

```bpl
import execStatus from "std/process.bpl";
extern printf(fmt: string, ...) ret int;

frame main() {
    local status: int = execStatus("git", "status");

    if (status == 0) {
        printf("Git command successful\n");
    } else {
        printf("Git command failed with code %d\n", status);
    }
}
```

### Capturing Output

When you need to process the output of a command.

```bpl
import execOutput, [ProcessResult] from "std/process.bpl";
extern printf(fmt: string, ...) ret int;

frame main() {
    # Capturing output from a constructed command
    local res: ProcessResult = execOutput("echo", "Hello", "World");

    # Ensure memory is cleaned up when scope exits
    defer res.output.destroy();

    if (res.exitCode == 0) {
        printf("Output: %s", res.output.data);
    }
}
```

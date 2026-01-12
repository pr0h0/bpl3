# Process Execution

The `std/process.bpl` module provides utilities for executing shell commands and interacting with subprocesses. It allows you to run commands, check their exit status, and capture their output. All functions effectively behave as varargs, space-joining all arguments to form the final command string.

**Safety Note:** This module automatically escapes all arguments to prevent OS command injection. You can safely pass user input as separate arguments to these functions.

## Import

```bpl
import exec, execStatus, execOutput, [ProcessResult] from "std/process.bpl";
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

The module automatically handles shell escaping for all arguments.

```bpl
# This is SAFE.
# The shell receives: echo 'hello;' 'echo' 'INJECTED'
# Output is literal "hello; echo INJECTED"
exec("echo", "hello; echo INJECTED");
```

### Functions

All execution functions accept variadic arguments `...string`. Arguments are joined by spaces to form the shell command string, and each argument is automatically escaped (wrapped in single quotes with internal escaping) to ensure safety.

#### `exec`

Executes a shell command and waits for it to complete. This function returns nothing and ignores the exit code.

```bpl
frame exec(args: ...string)
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

Executes a shell command safely but redirects both stdout and stderr to `/dev/null`. Useful for checking if a command works without cluttering the output.

```bpl
frame execSilent(args: ...string) ret int
```

- **Parameters**:
  - `args`: Components of the command line.
- **Returns**: The exit status code.

#### `sleep`

Pauses execution for the specified number of milliseconds.

```bpl
frame sleep(ms: int)
```

#### `execOutput`

Executes a shell command, captures its standard output, and returns both the exit code and the output.

```bpl
frame execOutput(args: ...string) ret ProcessResult
```

- **Parameters**:
  - `args`: Components of the command line.
- **Returns**: A `ProcessResult` struct containing the `exitCode` and `output`.

> **Note**: The `output` field in `ProcessResult` is a `String` object. You are responsible for managing its lifecycle if necessary, though it typically follows standard ownership rules.

## Examples

### Running a Command

You can pass the command as a single string (still auto-escaped, so be careful not to include shell metacharacters if you intend them to be interpreted) or as multiple arguments.

**Best Practice:** Pass the command and its arguments as separate parameters.

```bpl
import exec, execShell, execSilent from "std/process.bpl";

frame main() {
    # Preferred: Separate arguments
    # Safety: "bpl_test" and "/tmp/..." are escaped, preventing injection
    exec("mkdir", "-p", "/tmp/bpl_test");

    # Using shell features (piping) - USE execShell
    execShell("ls -la | grep bpl");

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
import printf from "libc";

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
import printf from "libc";

frame main() {
    # Capturing output from a constructed command
    local res: ProcessResult = execOutput("echo", "Hello", "World");

    # Ensure memory is cleaned up when scope exits
    defer res.output.destroy();

    if (res.exitCode == 0) {
        printf("Output: %s", res.output.data);
}
```

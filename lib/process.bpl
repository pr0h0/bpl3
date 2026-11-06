# Process execution utilities

import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

export exec;
export execStatus;
export execOutput;
export [ProcessResult];
export execShell;
export execSilent;
export sleep;
export run;
export runWith;
export [RunResult];

extern system(cmd: string) ret int;
extern popen(cmd: string, mode: string) ret *void;
extern pclose(stream: *void) ret int;
extern fgets(s: string, n: int, stream: *void) ret string;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
extern __bpl_sleep_us(microseconds: long) ret int;
extern __bpl_process_run(argv: *string, input: string, inputLength: long, timeoutMs: long, exitCode: *int, timedOut: *int, outData: *string, outLength: *long, errData: *string, errLength: *long) ret int;
extern strerror(error: int) ret string;
extern strlen(text: string) ret long;

struct ProcessResult {
    exitCode: int,
    output: String,
}

# Result of `run`/`runWith`. `stdout` and `stderr` hold the exact bytes the
# child wrote (`length` counts them; they may contain NUL bytes).
struct RunResult {
    exitCode: int,
    timedOut: bool,
    stdout: String,
    stderr: String,
}

# POSIX system/pclose return a wait status, not an application exit code.
# Preserve launch/wait errors; use shell-style 128 + signal for termination.
frame _exitCode(status: int) ret int {
    if (status < 0) {
        return -1;
    }
    local signal: int = status & 127;
    if (signal == 0) {
        return (status >> 8) & 255;
    }
    if (signal == 127) {
        return -1;
    }
    return 128 + signal;
}

frame _escapeArg(s: string) ret String {
    local ptr: *u8 = cast<*u8>(s);
    local len: int = 0;
    local i: int = 0;

    # Calculate required length
    loop {
        local c: u8 = ptr[i];
        if (c == 0) {
            break;
        }
        # Single quote '
        if (c == 39) {
            len = len + 4; # replaced by '\''
        } else {
            len = len + 1;
        }
        i = i + 1;
    }

    len = len + 2; # Surrounding quotes

    local res: String;
    res.length = len;
    res.data = malloc(cast<long>(len + 1));

    local out: *u8 = cast<*u8>(res.data);
    local idx: int = 0;

    # Open quote
    out[idx] = 39;
    idx = idx + 1;

    i = 0;
    loop {
        local c: u8 = ptr[i];
        if (c == 0) {
            break;
        }
        if (c == 39) {
            out[idx] = 39; # '
            out[idx + 1] = 92; # \
            out[idx + 2] = 39; # '
            out[idx + 3] = 39; # '
            idx = idx + 4;
        } else {
            out[idx] = c;
            idx = idx + 1;
        }
        i = i + 1;
    }

    # Close quote
    out[idx] = 39;
    idx = idx + 1;
    out[idx] = 0; # Null terminator

    return res;
}

frame _joinArgs(args: *string, count: int) ret String {
    local sb: StringBuilder = StringBuilder.new(1024);
    local i: int = 0;
    loop (i < count) {
        if (i > 0) {
            sb.append(" ");
        }
        local escaped: String = _escapeArg(args[i]);
        sb.append(escaped.data);
        escaped.destroy();
        i = i + 1;
    }

    local res: String = String.new(sb.toString());
    sb.destroy();
    return res;
}

/#
# Sleep
Pauses execution for the specified nonnegative number of milliseconds.
Retries interrupted waits and throws if the native wait fails.
#/
frame sleep(ms: int) {
    if (ms < 0) {
        throw "Process.sleep requires nonnegative milliseconds";
    }
    if (__bpl_sleep_us(cast<long>(ms) * 1000) != 0) {
        throw "Process.sleep failed";
    }
}

/#
# Execute command (void)
Executes a shell command and waits for it to complete. Returns nothing.
Supports multiple arguments which are joined by spaces and escaped.
#/
frame exec(args: ...string, count: int) {
    local cmd: String = _joinArgs(args, count);
    system(cmd.data);
    cmd.destroy();
}

/#
# Execute Raw Shell Command (Unsafe)
Executes a command string directly without any escaping.
Allows use of pipes (|), redirects (>), and environment variables.
Captures output. exitCode is 0–255, 128 + signal on termination, or -1
when launching or waiting fails.
WARNING: Prone to injection if using untrusted input.
#/
frame execShell(cmd: string) ret ProcessResult {
    local res: ProcessResult;

    # "r" for reading
    local mode: string = "r";
    local fp: *void = popen(cmd, mode);

    if (fp == nullptr) {
        res.exitCode = -1;
        res.output = String.new("");
        return res;
    }
    local sb: StringBuilder = StringBuilder.new(1024);

    # Allocate buffer for reading
    local bufSize: int = 1024;
    local buf: string = malloc(cast<long>(bufSize));

    if (buf == nullptr) {
        pclose(fp);
        sb.destroy();
        res.exitCode = -1;
        res.output = String.new("");
        return res;
    }
    loop {
        local ptr: string = fgets(buf, bufSize, fp);
        if (ptr == nullptr) {
            break;
        }
        sb.append(ptr);
    }

    res.exitCode = _exitCode(pclose(fp));

    # Create String from accumulated buffer
    res.output = String.new(sb.toString());

    # Cleanup
    free(buf);
    sb.destroy();

    return res;
}

/#
# Execute Silent (Status)
Executes a shell command safely but suppresses all output (stdout and stderr).
Returns the application exit code (0–255), 128 + signal on termination,
or -1 when launching or waiting fails.
#/
frame execSilent(args: ...string, count: int) ret int {
    local sb: StringBuilder = StringBuilder.new(1024);

    # Join args manually to reuse the buffer for redirection
    local i: int = 0;
    loop (i < count) {
        if (i > 0) {
            sb.append(" ");
        }
        local escaped: String = _escapeArg(args[i]);
        sb.append(escaped.data);
        escaped.destroy();
        i = i + 1;
    }

    sb.append(" > /dev/null 2>&1");

    local cmd: string = sb.toString();
    local status: int = system(cmd);

    sb.destroy();
    return _exitCode(status);
}

/#
# Execute command (status)
Executes a shell command and returns its application exit code (0–255).
Signal termination returns 128 + signal; launch/wait failure returns -1.
Supports multiple arguments which are joined by spaces.
#/
frame execStatus(args: ...string, count: int) ret int {
    local cmd: String = _joinArgs(args, count);
    local status: int = system(cmd.data);
    cmd.destroy();
    return _exitCode(status);
}

/#
# Execute command (capture)
Executes a shell command and captures its standard output.
Returns a struct containing the application exit code and output as a String.
Signal termination returns 128 + signal; launch/wait failure returns -1.
Supports multiple arguments which are joined by spaces.
#/
frame execOutput(args: ...string, count: int) ret ProcessResult {
    local res: ProcessResult;
    local cmd: String = _joinArgs(args, count);

    # "r" for reading
    local mode: string = "r";
    local fp: *void = popen(cmd.data, mode);

    if (fp == nullptr) {
        res.exitCode = -1;
        res.output = String.new("");
        cmd.destroy();
        return res;
    }
    local sb: StringBuilder = StringBuilder.new(1024);

    # Allocate buffer for reading
    local bufSize: int = 1024;
    local buf: string = malloc(cast<long>(bufSize));

    if (buf == nullptr) {
        pclose(fp);
        sb.destroy();
        res.exitCode = -1;
        res.output = String.new("");
        cmd.destroy();
        return res;
    }
    loop {
        local ptr: string = fgets(buf, bufSize, fp);
        if (ptr == nullptr) {
            break;
        }
        sb.append(ptr);
    }

    res.exitCode = _exitCode(pclose(fp));

    # Create String from accumulated buffer
    res.output = String.new(sb.toString());

    # Cleanup
    free(buf);
    sb.destroy();
    cmd.destroy();

    return res;
}

/#
# Run a program without a shell
Starts `args[0]` (looked up on PATH) with the remaining arguments passed
unchanged, waits for it, and captures stdout and stderr separately. Stdin is
`/dev/null`. exitCode is 0-255, 128 + signal on termination, or -1 when the
program could not be started; `stderr` then holds the reason.
#/
frame run(args: ...string, count: int) ret RunResult {
    return _run(cast<string>(nullptr), 0, args, count);
}

/#
# Run a program without a shell, with input and a timeout
Like `run`, and writes `input` (when not nullptr) to the child's stdin before
closing it. With `timeoutMs` > 0 the child runs in its own process group,
which is killed when the timeout expires; `timedOut` is then true and the
output read so far is kept.
#/
frame runWith(input: string, timeoutMs: int, args: ...string, count: int) ret RunResult {
    return _run(input, timeoutMs, args, count);
}

frame _run(input: string, timeoutMs: int, args: *string, count: int) ret RunResult {
    local result: RunResult;
    result.exitCode = -1;
    result.timedOut = false;
    if (count <= 0) {
        result.stdout = String.new("");
        result.stderr = String.new("run requires a program name");
        return result;
    }

    # argv must be NULL-terminated for posix_spawn.
    local argv: *string = cast<*string>(malloc(cast<long>(count + 1) * cast<long>(8)));
    if (argv == nullptr) {
        result.stdout = String.new("");
        result.stderr = String.new("run could not allocate arguments");
        return result;
    }
    local i: int = 0;
    loop (i < count) {
        argv[i] = args[i];
        i = i + 1;
    }
    argv[count] = cast<string>(nullptr);

    local inputLength: long = 0;
    if (input != nullptr) {
        inputLength = strlen(input);
    }
    local exitCode: int = -1;
    local timedOut: int = 0;
    local outData: string = cast<string>(nullptr);
    local outLength: long = 0;
    local errData: string = cast<string>(nullptr);
    local errLength: long = 0;
    local error: int = __bpl_process_run(argv, input, inputLength, cast<long>(timeoutMs), &exitCode, &timedOut, &outData, &outLength, &errData, &errLength);
    free(cast<string>(argv));

    if (error != 0) {
        result.stdout = String.new("");
        result.stderr = String.new(strerror(error));
        return result;
    }
    if ((outLength > cast<long>(2147483646)) || (errLength > cast<long>(2147483646))) {
        free(outData);
        free(errData);
        result.stdout = String.new("");
        result.stderr = String.new("run output exceeds the String size limit");
        return result;
    }
    result.exitCode = exitCode;
    result.timedOut = timedOut != 0;
    result.stdout.data = outData;
    result.stdout.length = cast<int>(outLength);
    result.stderr.data = errData;
    result.stderr.length = cast<int>(errLength);
    return result;
}

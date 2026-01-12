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

extern system(cmd: string) ret int;
extern popen(cmd: string, mode: string) ret *void;
extern pclose(stream: *void) ret int;
extern fgets(s: string, n: int, stream: *void) ret string;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
extern usleep(usec: uint) ret void;

struct ProcessResult {
    exitCode: int,
    output: String,
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
Pauses execution for the specified number of milliseconds.
#/
frame sleep(ms: int) {
    usleep(cast<uint>(ms * 1000));
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
Captures output.
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

    res.exitCode = pclose(fp);

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
Returns the exit status code.
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
    return status;
}

/#
# Execute command (status)
Executes a shell command and returns the exit status code.
Supports multiple arguments which are joined by spaces.
#/
frame execStatus(args: ...string, count: int) ret int {
    local cmd: String = _joinArgs(args, count);
    local status: int = system(cmd.data);
    cmd.destroy();
    return status;
}

/#
# Execute command (capture)
Executes a shell command and captures its standard output.
Returns a struct containing the exit code and the output as a String.
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

    res.exitCode = pclose(fp);

    # Create String from accumulated buffer
    res.output = String.new(sb.toString());

    # Cleanup
    free(buf);
    sb.destroy();
    cmd.destroy();

    return res;
}

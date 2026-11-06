# Leveled logging
#
# Messages below the minimum level are dropped. By default every level is
# written, without a prefix, to standard output; `Log.setPrefix(true)` adds
# `[DEBUG] `, `[INFO] `, `[WARN] ` or `[ERROR] `, `Log.setTimestamps(true)`
# starts lines with the UTC time, and `Log.useStderr(true)` keeps log lines out
# of program output.

export [Log];
export [LogLevel];

import printf, snprintf from "std/c.bpl";
import [Env] from "std/env.bpl";
import [DateTime] from "std/date.bpl";
import [Time] from "std/time.bpl";

extern __bpl_write_stderr(message: string);

/# Log severities, from most to least verbose. `Off` disables logging. #/
enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
    Off,
}

global LOG_MIN_RANK: int = 0;
global LOG_PREFIX: bool = false;
global LOG_STDERR: bool = false;
global LOG_TIMESTAMPS: bool = false;

frame logRank(level: LogLevel) ret int {
    return match (level) {
        LogLevel.Debug => 0,
        LogLevel.Info => 1,
        LogLevel.Warn => 2,
        LogLevel.Error => 3,
        LogLevel.Off => 4,
    };
}

frame logTag(level: LogLevel) ret string {
    return match (level) {
        LogLevel.Debug => "[DEBUG] ",
        LogLevel.Info => "[INFO] ",
        LogLevel.Warn => "[WARN] ",
        LogLevel.Error => "[ERROR] ",
        LogLevel.Off => "",
    };
}

frame logWrite(level: LogLevel, msg: string) {
    if (logRank(level) < LOG_MIN_RANK) {
        return;
    }
    local tag: string = "";
    if (LOG_PREFIX) {
        tag = logTag(level);
    }
    # Room for "2026-11-01T12:34:56.789Z " with a five-digit year.
    local stamp: u8[40];
    stamp[0] = cast<u8>(0);
    if (LOG_TIMESTAMPS) {
        logTimestamp(&stamp[0], 40);
    }
    local time: string = cast<string>(&stamp[0]);
    if (LOG_STDERR) {
        __bpl_write_stderr(time);
        __bpl_write_stderr(tag);
        __bpl_write_stderr(msg);
        __bpl_write_stderr("\n");
    } else {
        printf("%s%s%s\n", time, tag, msg);
    }
}

# Writes the current UTC time as `YYYY-MM-DDTHH:MM:SS.mmmZ ` (ISO 8601).
frame logTimestamp(output: *u8, size: long) {
    local ms: long = Time.nowMs();
    local now: DateTime = DateTime.fromTimestamp(ms / cast<long>(1000));
    snprintf(cast<string>(output), size, "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ ", now.year, now.month, now.day, now.hour, now.minute, now.second, cast<int>(ms % cast<long>(1000)));
}

struct Log {
    frame debug(msg: string) {
        logWrite(LogLevel.Debug, msg);
    }
    frame info(msg: string) {
        logWrite(LogLevel.Info, msg);
    }
    frame warn(msg: string) {
        logWrite(LogLevel.Warn, msg);
    }
    frame error(msg: string) {
        logWrite(LogLevel.Error, msg);
    }

    /# Writes `msg` at `level`; `LogLevel.Off` messages are never written. #/
    frame write(level: LogLevel, msg: string) {
        if (logRank(level) < logRank(LogLevel.Off)) {
            logWrite(level, msg);
        }
    }

    /# Drops messages less severe than `level`. #/
    frame setLevel(level: LogLevel) {
        LOG_MIN_RANK = logRank(level);
    }

    /# Whether a message at `level` would be written. #/
    frame enabled(level: LogLevel) ret bool {
        return (logRank(level) < logRank(LogLevel.Off)) && (logRank(level) >= LOG_MIN_RANK);
    }

    /# Prefixes each line with its level, such as `[WARN] `. #/
    frame setPrefix(enabled: bool) {
        LOG_PREFIX = enabled;
    }

    /#
    Starts each line with the current UTC time in ISO 8601 with milliseconds,
    such as `2026-11-01T12:34:56.789Z `, before any level prefix.
    #/
    frame setTimestamps(enabled: bool) {
        LOG_TIMESTAMPS = enabled;
    }

    /# Writes log lines to standard error instead of standard output. #/
    frame useStderr(enabled: bool) {
        LOG_STDERR = enabled;
    }

    /#
    Sets the level from the `BPL_LOG_LEVEL` environment variable (`debug`,
    `info`, `warn`, `error` or `off`, in lower or upper case). Returns false,
    leaving the level unchanged, when the variable is unset or unrecognized.
    #/
    frame levelFromEnv() ret bool {
        switch (Env.get("BPL_LOG_LEVEL")) {
            case "debug":
                fallthrough;
            case "DEBUG":
                Log.setLevel(LogLevel.Debug);
                return true;
            case "info":
                fallthrough;
            case "INFO":
                Log.setLevel(LogLevel.Info);
                return true;
            case "warn":
                fallthrough;
            case "WARN":
                Log.setLevel(LogLevel.Warn);
                return true;
            case "error":
                fallthrough;
            case "ERROR":
                Log.setLevel(LogLevel.Error);
                return true;
            case "off":
                fallthrough;
            case "OFF":
                Log.setLevel(LogLevel.Off);
                return true;
            default:
                return false;
        }
    }
}

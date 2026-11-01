# Leveled logging
#
# Messages below the minimum level are dropped. By default every level is
# written, without a prefix, to standard output; `Log.setPrefix(true)` adds
# `[DEBUG] `, `[INFO] `, `[WARN] ` or `[ERROR] `, and `Log.useStderr(true)`
# keeps log lines out of program output.

export [Log];
export [LogLevel];

import printf from "std/c.bpl";
import [Env] from "std/env.bpl";

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
    if (LOG_STDERR) {
        __bpl_write_stderr(tag);
        __bpl_write_stderr(msg);
        __bpl_write_stderr("\n");
    } else {
        printf("%s%s\n", tag, msg);
    }
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

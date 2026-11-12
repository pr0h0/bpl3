# Structured logging: one JSON object (or logfmt line) per event.

import [JsonValue], [JsonKind] from "bpl-json";
import [LogLevel] from "std/log.bpl";
import [DateTime] from "std/date.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Time] from "std/time.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern snprintf(buffer: string, size: ulong, format: string, ...) ret int;
extern write(fd: int, data: string, size: ulong) ret long;
extern __errno_location() ret *int;

export [Logger];
export [LogEvent];
export [LogFormat];
export [LogSink];
export [LogClock];

enum LogFormat {
    Json,
    Logfmt,
}

# Receives each complete line (with its trailing newline).
type LogSink = Lambda<void>(string, long);
# Wall-clock milliseconds since the Unix epoch.
type LogClock = Lambda<long>();

frame logSystemClock() ret long {
    return Time.nowMs();
}

frame logLevelRank(level: LogLevel) ret int {
    return match (level) {
        LogLevel.Debug => 0,
        LogLevel.Info => 1,
        LogLevel.Warn => 2,
        LogLevel.Error => 3,
        LogLevel.Off => 4,
    };
}

frame logLevelName(level: LogLevel) ret string {
    return match (level) {
        LogLevel.Debug => "debug",
        LogLevel.Info => "info",
        LogLevel.Warn => "warn",
        LogLevel.Error => "error",
        LogLevel.Off => "off",
    };
}

frame logCopy(text: string) ret string {
    local length: long = strlen(text);
    local copy: string = cast<string>(malloc(length + 1));
    if (copy == nullptr) {
        throw "Log allocation failed";
    }
    loop (local i: long = 0; i <= length; i = i + 1) {
        copy[i] = text[i];
    }
    return copy;
}

# Lowercase ASCII comparison.
frame logSameKey(a: string, b: string) ret bool {
    local i: int = 0;
    loop ((a[i] != 0) && (b[i] != 0)) {
        local x: char = a[i];
        local y: char = b[i];
        if ((x >= 'A') && (x <= 'Z')) {
            x = x + cast<char>(32);
        }
        if ((y >= 'A') && (y <= 'Z')) {
            y = y + cast<char>(32);
        }
        if (x != y) {
            return false;
        }
        i = i + 1;
    }
    return a[i] == b[i];
}

struct Logger {
    min_rank: int,
    format: LogFormat,
    # File descriptor for output (1 stdout, 2 stderr) when no sink is set.
    fd: int,
    sink: LogSink,
    has_sink: bool,
    clock: LogClock,
    # Context fields added to every event (owned object).
    context: *JsonValue,
    # Keys whose values are replaced by "[REDACTED]" (owned).
    redacted: Array<string>,

    # A JSON-lines logger writing Info and above to standard error, with
    # common secret keys redacted.
    frame new() ret Logger {
        local logger: Logger;
        logger.min_rank = 1;
        logger.format = LogFormat.Json;
        logger.fd = 2;
        logger.has_sink = false;
        logger.clock = logSystemClock;
        logger.context = JsonValue.newObject();
        logger.redacted = Array<string>.new(8);
        local defaults: string[7] = ["password", "secret", "token", "authorization", "cookie", "set-cookie", "api_key"];
        loop (local i: int = 0; i < 7; i = i + 1) {
            logger.redacted.push(logCopy(defaults[i]));
        }
        return logger;
    }
    frame setLevel(this: *Logger, level: LogLevel) {
        this.min_rank = logLevelRank(level);
    }
    frame enabled(this: *Logger, level: LogLevel) ret bool {
        return (level != LogLevel.Off) && (logLevelRank(level) >= this.min_rank);
    }
    frame setFormat(this: *Logger, format: LogFormat) {
        this.format = format;
    }
    # 1 for standard output, 2 for standard error, or another open descriptor.
    frame setOutput(this: *Logger, fd: int) {
        if (fd < 0) {
            throw "Log output descriptor must be open";
        }
        this.fd = fd;
        this.has_sink = false;
    }
    frame setSink(this: *Logger, sink: LogSink) {
        this.sink = sink;
        this.has_sink = true;
    }
    frame setClock(this: *Logger, clock: LogClock) {
        this.clock = clock;
    }
    # Adds a key (case-insensitive) whose values are always redacted.
    frame redact(this: *Logger, key: string) {
        this.redacted.push(logCopy(key));
    }
    frame isRedacted(this: *Logger, key: string) ret bool {
        loop (local i: int = 0; i < this.redacted.len(); i = i + 1) {
            if (logSameKey(this.redacted.get(i), key)) {
                return true;
            }
        }
        return false;
    }
    # Context fields appear on every event of this logger (and its children).
    frame with(this: *Logger, key: string, value: string) ret *Logger {
        this.context.setString(key, value);
        return this;
    }
    frame withInt(this: *Logger, key: string, value: long) ret *Logger {
        this.context.setInt(key, value);
        return this;
    }
    frame withBool(this: *Logger, key: string, value: bool) ret *Logger {
        this.context.setBool(key, value);
        return this;
    }
    # An independent logger with the same settings and a copy of the context,
    # e.g. per request. Destroy it separately.
    frame child(this: *Logger) ret Logger {
        local copy: Logger = *this;
        copy.context = this.context.clone();
        copy.redacted = Array<string>.new(this.redacted.len());
        loop (local i: int = 0; i < this.redacted.len(); i = i + 1) {
            copy.redacted.push(logCopy(this.redacted.get(i)));
        }
        return copy;
    }
    frame destroy(this: *Logger) {
        if (this.context != nullptr) {
            this.context.destroy();
            this.context = nullptr;
        }
        loop (local i: int = 0; i < this.redacted.len(); i = i + 1) {
            free(this.redacted.get(i));
        }
        this.redacted.destroy();
    }

    # Starts an event; add fields, then call send(). Disabled levels return
    # an event that ignores fields and writes nothing.
    frame event(this: *Logger, level: LogLevel, message: string) ret LogEvent {
        local event: LogEvent;
        event.logger = this;
        event.level = level;
        event.enabled = this.enabled(level);
        event.message = nullptr;
        event.fields = nullptr;
        if (event.enabled) {
            event.message = logCopy(message);
            event.fields = JsonValue.newObject();
        }
        return event;
    }
    frame debug(this: *Logger, message: string) {
        local event: LogEvent = this.event(LogLevel.Debug, message);
        event.send();
    }
    frame info(this: *Logger, message: string) {
        local event: LogEvent = this.event(LogLevel.Info, message);
        event.send();
    }
    frame warn(this: *Logger, message: string) {
        local event: LogEvent = this.event(LogLevel.Warn, message);
        event.send();
    }
    frame error(this: *Logger, message: string) {
        local event: LogEvent = this.event(LogLevel.Error, message);
        event.send();
    }

    frame timestamp(this: *Logger, out: *StringBuilder) {
        local ms: long = this.clock();
        local seconds: long = ms / 1000;
        local millis: long = ms % 1000;
        if (millis < 0) {
            millis = millis + 1000;
            seconds = seconds - 1;
        }
        local now: DateTime = DateTime.fromTimestamp(seconds);
        local buffer: char[40];
        snprintf(cast<string>(&buffer[0]), 40, "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", now.year, now.month, now.day, now.hour, now.minute, now.second, cast<int>(millis));
        out.append(cast<string>(&buffer[0]));
    }
    frame appendJsonMembers(this: *Logger, out: *StringBuilder, object: *JsonValue) {
        loop (local i: int = 0; i < object.len(); i = i + 1) {
            local key: string = object.keyAt(i);
            if ((object.indexOf(key) != i) || (strcmp(key, "time") == 0) || (strcmp(key, "level") == 0) || (strcmp(key, "msg") == 0)) {
                continue;
            }
            out.appendChar(',');
            JsonValue.quote(out, key);
            out.appendChar(':');
            if (this.isRedacted(key)) {
                out.append("\"[REDACTED]\"");
            } else {
                local value: *JsonValue = object.at(i);
                value.write(out, -1, 0);
            }
        }
    }
    frame logfmtValue(out: *StringBuilder, text: string) {
        local plain: bool = text[0] != 0;
        loop (local i: int = 0; plain && (text[i] != 0); i = i + 1) {
            local c: char = text[i];
            if ((cast<u8>(c) <= cast<u8>(32)) || (c == '"') || (c == '=') || (c == '\\') || (c == 127)) {
                plain = false;
            }
        }
        if (plain) {
            out.append(text);
            return;
        }
        JsonValue.quote(out, text);
    }
    # logfmt keys keep letters, digits and _ . - / ; others become '_'.
    frame logfmtKey(out: *StringBuilder, key: string) {
        if (key[0] == 0) {
            out.appendChar('_');
            return;
        }
        loop (local i: int = 0; key[i] != 0; i = i + 1) {
            local c: char = key[i];
            if (((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9')) || (c == '_') || (c == '.') || (c == '-') || (c == '/')) {
                out.appendChar(c);
            } else {
                out.appendChar('_');
            }
        }
    }
    frame appendLogfmtMembers(this: *Logger, out: *StringBuilder, object: *JsonValue) {
        loop (local i: int = 0; i < object.len(); i = i + 1) {
            local key: string = object.keyAt(i);
            if ((object.indexOf(key) != i) || (strcmp(key, "time") == 0) || (strcmp(key, "level") == 0) || (strcmp(key, "msg") == 0)) {
                continue;
            }
            out.appendChar(' ');
            Logger.logfmtKey(out, key);
            out.appendChar('=');
            local value: *JsonValue = object.at(i);
            if (this.isRedacted(key)) {
                out.append("[REDACTED]");
            } else if (value.isString()) {
                Logger.logfmtValue(out, value.text);
            } else {
                local text: String = value.stringify();
                Logger.logfmtValue(out, text.data);
                text.destroy();
            }
        }
    }
    # Event fields override context fields with the same key.
    frame merged(this: *Logger, fields: *JsonValue) ret *JsonValue {
        local all: *JsonValue = this.context.clone();
        loop (local i: int = 0; i < fields.len(); i = i + 1) {
            local key: string = fields.keyAt(i);
            if (fields.indexOf(key) == i) {
                local value: *JsonValue = fields.at(i);
                all.set(key, value.clone());
            }
        }
        return all;
    }
    frame emit(this: *Logger, level: LogLevel, message: string, fields: *JsonValue) {
        local all: *JsonValue = this.merged(fields);
        local out: StringBuilder = StringBuilder.new(128);
        local owner: *StringBuilder = &out;
        defer owner.destroy();
        if (this.format == LogFormat.Json) {
            out.append("{\"time\":\"");
            this.timestamp(&out);
            out.append("\",\"level\":\"");
            out.append(logLevelName(level));
            out.append("\",\"msg\":");
            JsonValue.quote(&out, message);
            this.appendJsonMembers(&out, all);
            out.append("}\n");
        } else {
            out.append("time=");
            this.timestamp(&out);
            out.append(" level=");
            out.append(logLevelName(level));
            out.append(" msg=");
            Logger.logfmtValue(&out, message);
            this.appendLogfmtMembers(&out, all);
            out.appendChar('\n');
        }
        all.destroy();
        local line: string = out.toString();
        local size: long = cast<long>(out.len());
        if (this.has_sink) {
            this.sink(line, size);
            return;
        }
        # One write per line keeps lines whole across worker processes.
        local offset: long = 0;
        loop (offset < size) {
            local written: long = write(this.fd, line + offset, cast<ulong>(size - offset));
            if (written < 0) {
                local error: *int = __errno_location();
                if (error[0] == 4) {
                    continue;
                }
                return;
            }
            offset = offset + written;
        }
    }
}

struct LogEvent {
    logger: *Logger,
    level: LogLevel,
    enabled: bool,
    message: string,
    fields: *JsonValue,

    frame str(this: *LogEvent, key: string, value: string) ret *LogEvent {
        if (this.enabled) {
            if (value == nullptr) {
                this.fields.setNull(key);
            } else {
                this.fields.setString(key, value);
            }
        }
        return this;
    }
    frame int(this: *LogEvent, key: string, value: long) ret *LogEvent {
        if (this.enabled) {
            this.fields.setInt(key, value);
        }
        return this;
    }
    frame num(this: *LogEvent, key: string, value: double) ret *LogEvent {
        if (this.enabled) {
            this.fields.setNumber(key, value);
        }
        return this;
    }
    frame bool(this: *LogEvent, key: string, value: bool) ret *LogEvent {
        if (this.enabled) {
            this.fields.setBool(key, value);
        }
        return this;
    }
    # Adds a copy of any JSON value (object, array, ...); `value` is borrowed.
    frame json(this: *LogEvent, key: string, value: *JsonValue) ret *LogEvent {
        if (this.enabled && (value != nullptr)) {
            this.fields.set(key, value.clone());
        }
        return this;
    }
    # Records an error description under "error".
    frame err(this: *LogEvent, message: string) ret *LogEvent {
        return this.str("error", message);
    }
    # Writes the event (when enabled) and releases its fields. Send once.
    frame send(this: *LogEvent) {
        if (this.enabled) {
            this.logger.emit(this.level, this.message, this.fields);
            this.discard();
        }
        this.enabled = false;
    }
    # Releases an event without writing it.
    frame discard(this: *LogEvent) {
        if (this.fields != nullptr) {
            this.fields.destroy();
            this.fields = nullptr;
        }
        free(this.message);
        this.message = nullptr;
        this.enabled = false;
    }
}

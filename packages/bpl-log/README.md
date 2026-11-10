# bpl-log

Structured logging: every event is one line of JSON (or
[logfmt](https://brandur.org/logfmt)) with a timestamp, level, message,
context fields and typed event fields, ready for log collectors. The plain
leveled logger in `std/log.bpl` writes free text; use this package when logs
are read by machines.

```bpl
import [Logger], [LogEvent], [LogLevel] from "bpl-log";

frame main() ret int {
    local log: Logger = Logger.new();
    log.with("service", "college-web").withInt("worker", 1);
    log.info("listening");
    # {"time":"2026-11-10T09:30:00.123Z","level":"info","msg":"listening","service":"college-web","worker":1}

    local event: LogEvent = log.event(LogLevel.Warn, "slow query");
    event.int("ms", 1520).str("table", "tasks").str("password", "never logged").send();
    # ..."msg":"slow query","service":"college-web","worker":1,"ms":1520,"table":"tasks","password":"[REDACTED]"}

    local request: Logger = log.child();
    request.with("request_id", "4f1c");
    request.error("handler failed");
    request.destroy();
    log.destroy();
    return 0;
}
```

## API

- `Logger.new()` writes JSON lines for `Info` and above to standard error.
  `setLevel(LogLevel.Debug | Info | Warn | Error | Off)` (the `LogLevel` enum
  of `std/log.bpl`, re-exported), `enabled(level)`,
  `setFormat(LogFormat.Json | LogFormat.Logfmt)`, `setOutput(fd)` (1 for
  standard output), `setSink(sink)` to receive each finished line
  (`Lambda<void>(string, long)`, with its newline) instead, and
  `setClock(clock)` to replace the millisecond wall clock (for tests).
- `with(key, value)`, `withInt` and `withBool` add context fields to every
  later event. `child()` returns an independent copy of the logger and its
  context (for a request or job) that must be destroyed separately.
- `debug`, `info`, `warn` and `error(message)` write a message-only event.
  `event(level, message)` returns a `LogEvent`; chain `str`, `int`, `num`,
  `bool`, `json` (a copy of any bpl-json value) and `err` (sets `error`), then
  call `send()` once. An event for a disabled level ignores fields and writes
  nothing. Call `discard()` to drop an event without sending it; an event
  that is neither sent nor discarded leaks its fields.
- `redact(key)` adds a key whose value is always written as `[REDACTED]`.
  `password`, `secret`, `token`, `authorization`, `cookie`, `set-cookie` and
  `api_key` are redacted by default; matching ignores ASCII case. Redaction
  matches keys only: never put secrets in messages.

## Output

JSON lines always start with `time` (UTC, ISO 8601 with milliseconds),
`level` and `msg`, followed by context fields and then event fields. An
event field replaces a context field with the same key, and fields named
`time`, `level` or `msg` are dropped so they cannot spoof the envelope.
Strings are JSON-escaped (quotes, backslashes, control characters), so a
message containing newlines stays on one line.

Logfmt lines use `key=value` pairs; values with spaces, quotes, `=`, or
control characters are quoted with JSON escapes, and key characters outside
letters, digits and `_ . - /` become `_`. Non-string values are written in
their JSON form.

Each line is written with one `write` call (retried on interruption), so lines
from `listenWorkers` processes sharing a descriptor do not interleave. Write
errors are ignored; logging never throws on output failure. The logger is not
synchronized for threads.

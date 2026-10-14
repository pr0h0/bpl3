import [Map] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Request], [Response], [HttpMethod] from "bpl-express";
import [StringBuilder] from "std/string_builder.bpl";
import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [JSON] from "std/json.bpl";
import [Time] from "std/time.bpl";
extern getpid() ret int;
extern sprintf(buffer: string, format: string, ...) ret int;
extern strlen(text: string) ret long;
extern write(fd: int, data: string, size: ulong) ret long;
export [AccessLog];
export requestId;
export accessLog;
global requestSequence: ulong = 0;
struct AccessEvent {
    request_id: string,
    method: string,
    route: string,
    status: int,
    duration_ms: long,
    io_failed: bool,
    handler_failed: bool,
    time_ms: long,
}
# Generated IDs replace incoming IDs; query strings, URL parameter values, headers and bodies are omitted.
frame requestId(req: *Request, res: *Response) {
    if (req.started_at == 0) {
        req.started_at = Time.monotonicMs();
    }
    requestSequence = requestSequence + 1;
    local id: char[96];
    sprintf(cast<string>(&id[0]), "%d-%ld-%lu", getpid(), Time.monotonicMs(), requestSequence);
    req.setState("request.id", cast<string>(&id[0]));
    res.setHeader("X-Request-ID", cast<string>(&id[0]));
}
frame accessLog(req: *Request, res: *Response) {
    AccessLog.write(req, res, 1);
}
struct AccessLog {
    # Write one bounded JSON line to a blocking log FD. Use a dedicated local file/pipe.
    frame write(req: *Request, res: *Response, fd: int) ret bool {
        local id: Option<string> = req.state.get("request.id");
        if (!id.isSome()) {
            return false;
        }
        local event: AccessEvent;
        event.request_id = id.unwrap();
        event.route = "[unmatched]";
        local route: Option<string> = req.state.get("request.route");
        if (route.isSome() && (strlen(route.unwrap()) <= 256)) {
            event.route = route.unwrap();
        }
        event.method = "UNKNOWN";
        match (req.method) {
            HttpMethod.GET => event.method = "GET",
            HttpMethod.POST => event.method = "POST",
            HttpMethod.PUT => event.method = "PUT",
            HttpMethod.DELETE => event.method = "DELETE",
            HttpMethod.PATCH => event.method = "PATCH",
            HttpMethod.OPTIONS => event.method = "OPTIONS",
            HttpMethod.HEAD => event.method = "HEAD",
            _ => {
            },
        };
        event.status = res.status_code;
        event.io_failed = res.io_failed;
        event.handler_failed = res.handler_failed;
        event.time_ms = Time.nowMs();
        event.duration_ms = Time.monotonicMs() - req.started_at;
        if (event.duration_ms < 0) {
            event.duration_ms = 0;
        }
        local json: String = JSON.stringify<AccessEvent>(&event);
        local jsonOwner: *String = &json;
        defer jsonOwner.destroy();
        local line: StringBuilder = StringBuilder.new(512);
        local lineOwner: *StringBuilder = &line;
        defer lineOwner.destroy();
        line.append(json.data);
        line.append("\n");
        # Keep under Linux PIPE_BUF for one write shared by process workers.
        if (line.length > 4096) {
            return false;
        }
        return write(fd, line.toString(), cast<ulong>(line.length)) == cast<long>(line.length);
    }
}

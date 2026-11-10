# Response helpers shared by the handlers.

import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [StringBuilder] from "std/string_builder.bpl";

export [Reply];

struct Reply {
    frame json(res: *Response, status: int, w: *JsonWriter) {
        res.status(status).json(w.toString());
    }

    frame ok(res: *Response, w: *JsonWriter) {
        res.status(200).json(w.toString());
    }

    frame error(res: *Response, status: int, message: string) {
        local w: JsonWriter = JsonWriter.new(128);
        w.beginObject().fieldStr("error", message).fieldInt("status", cast<long>(status)).endObject();
        res.status(status).json(w.toString());
        w.destroy();
    }

    frame errorDetail(res: *Response, status: int, message: string, detail: string) {
        local w: JsonWriter = JsonWriter.new(128);
        w.beginObject().fieldStr("error", message).fieldStr("detail", detail).fieldInt("status", cast<long>(status)).endObject();
        res.status(status).json(w.toString());
        w.destroy();
    }

    frame notFound(res: *Response, what: string) {
        Reply.errorDetail(res, 404, "not found", what);
    }

    frame csv(res: *Response, filename: string, sb: *StringBuilder) {
        local disposition: StringBuilder = StringBuilder.new(64);
        disposition.append("attachment; filename=\"");
        disposition.append(filename);
        disposition.append("\"");
        res.status(200).setHeader("Content-Type", "text/csv; charset=utf-8").setHeader("Content-Disposition", disposition.toString());
        res.send(sb.toString());
        disposition.destroy();
    }

    frame text(res: *Response, content_type: string, body: string) {
        res.status(200).setHeader("Content-Type", content_type);
        res.send(body);
    }
}

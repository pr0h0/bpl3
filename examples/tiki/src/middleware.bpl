import [Request], [Response], [HttpMethod] from "bpl-express";
import [printf] from "std/c.bpl";

frame logger(req: *Request, _res: *Response) {
    local method_str: string = "UNKNOWN";
    if (req.method == HttpMethod.GET) {
        method_str = "GET";
    }
    if (req.method == HttpMethod.POST) {
        method_str = "POST";
    }
    if (req.method == HttpMethod.PUT) {
        method_str = "PUT";
    }
    if (req.method == HttpMethod.DELETE) {
        method_str = "DELETE";
    }
    printf("[LOG] %s %s\n", method_str, req.path);
}

export logger;

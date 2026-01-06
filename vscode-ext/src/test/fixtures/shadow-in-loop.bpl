import [Request], [Response] from "bpl-express";

frame getTodos(req: *Request, res: *Response) {
    local json_buf: char[4096];
    local ptr: string = cast<string>(&json_buf[0]);

    req.getParam("id");
    req.body;

    local i: int = 0;
    loop (i < 10) {
        req.body;
        if (i > 0) {
            local _x: int = 1;
        }
        local req: int = 1;
        req = req + 1;
        i = i + 1;
    }

    res.json(ptr);
}

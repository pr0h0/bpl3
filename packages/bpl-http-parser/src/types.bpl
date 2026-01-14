import [Map] from "std/map.bpl";

export [ParsedRequest];

struct ParsedRequest {
    method: string,
    path: string,
    query: Map<string, string>,
    headers: Map<string, string>,
    body: string,
    params: Map<string, string>,
    # For route params like /users/:id

    frame new() ret ParsedRequest {
        local req: ParsedRequest;
        req.query = Map<string, string>.new();
        req.headers = Map<string, string>.new();
        req.params = Map<string, string>.new();
        req.method = "";
        req.path = "";
        req.body = "";
        return req;
    }

    frame destroy(this: *ParsedRequest) {
        this.query.destroy();
        this.headers.destroy();
        this.params.destroy();
    }
}

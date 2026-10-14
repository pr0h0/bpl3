import [HttpHeaders] from "./headers.bpl";
import [Array] from "std/array.bpl";
import [Map], [MapNode] from "std/map.bpl";
extern free(ptr: string);
export [ParsedRequest];
export releaseStrings;

# Only for maps whose keys and values are individually owned allocations.
frame releaseStrings(map: *Map<string, string>) {
    loop (local i: int = 0; i < map.buckets.len(); i = i + 1) {
        local node: *MapNode<string, string> = map.buckets.get(i);
        loop (node != nullptr) {
            free(node.key);
            free(node.value);
            node = node.next;
        }
    }
    map.destroy();
}

struct ParsedRequest {
    method: string,
    path: string,
    query: Map<string, string>,
    headers: HttpHeaders,
    body: string,
    params: Map<string, string>,
    valid: bool,
    error_code: int,
    body_length: long,
    message_length: long,
    frame new() ret ParsedRequest {
        local req: ParsedRequest;
        req.query = Map<string, string>.new();
        req.headers = HttpHeaders.new();
        req.params = Map<string, string>.new();
        req.method = nullptr;
        req.path = nullptr;
        req.body = nullptr;
        req.valid = false;
        req.error_code = 0;
        req.body_length = 0;
        req.message_length = 0;
        return req;
    }
    frame destroy(this: *ParsedRequest) {
        releaseStrings(&this.query);
        this.headers.destroy();
        releaseStrings(&this.params);
        free(this.method);
        free(this.path);
        free(this.body);
        this.method = nullptr;
        this.path = nullptr;
        this.body = nullptr;
        this.valid = false;
    }
}

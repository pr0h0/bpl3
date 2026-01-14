import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";

export [HttpHeaders];

struct HttpHeaders {
    headers: Map<string, string>,

    frame new() ret HttpHeaders {
        local h: HttpHeaders;
        h.headers = Map<string, string>.new(16);
        return h;
    }

    frame set(this: *HttpHeaders, key: string, value: string) {
        this.headers.set(key, value);
    }

    frame get(this: *HttpHeaders, key: string) ret Option<string> {
        return this.headers.get(key);
    }

    frame has(this: *HttpHeaders, key: string) ret bool {
        return this.headers.has(key);
    }
}

import [ParsedRequest] from "./types.bpl";
import [Map] from "std/map.bpl";
import [String] from "std/string.bpl";
import [Option] from "std/option.bpl";
import strchr, strstr, strlen, strncmp, strcmp, strcpy, strncpy, malloc, free, atoi, memset, printf from "./libc.bpl";

export [HttpParser];

struct HttpParser {

    frame parse(raw_req: string) ret ParsedRequest {
        local parsed: ParsedRequest = ParsedRequest.new();

        # 1. Split into lines
        # DEBUG
        # printf("DEBUG_PARSER: raw_req len %d\n", strlen(raw_req));

        local cursor: string = raw_req;

        # Parse Request Line
        local line_end: string = strstr(cursor, "\r\n");
        if (line_end == nullptr) {
            return parsed;
        }
        # Method
        local method_end: string = strchr(cursor, 32); # space
        if (method_end == nullptr) {
            return parsed;
        }
        local method_len: long = cast<long>(method_end) - cast<long>(cursor);
        parsed.method = malloc(method_len + 1);
        strncpy(parsed.method, cursor, method_len);
        parsed.method[method_len] = cast<char>(0);

        cursor = cast<string>(cast<*char>(cast<long>(method_end) + 1));

        # Path + Query
        local path_end: string = strchr(cursor, 32); # space
        if (path_end == nullptr) {
            return parsed;
        }
        local full_path_len: long = cast<long>(path_end) - cast<long>(cursor);
        local full_path: string = malloc(full_path_len + 1);
        strncpy(full_path, cursor, full_path_len);
        full_path[full_path_len] = cast<char>(0);

        # printf("DEBUG_PARSER: FullPath='%s'\n", full_path);

        # Parse Query String
        local query_start: string = strchr(full_path, 63); # ?

        # printf("DEBUG_PARSER: FullPath='%s'\n", full_path);

        if (query_start != nullptr) {
            # Path is up to ?
            local path_len: long = cast<long>(query_start) - cast<long>(full_path);
            parsed.path = malloc(path_len + 1);
            strncpy(parsed.path, full_path, path_len);
            parsed.path[path_len] = cast<char>(0);

            # Parse Query Params
            HttpParser.parseQuery(cast<string>(cast<*char>(cast<long>(query_start) + 1)), &parsed.query);
        } else {
            parsed.path = malloc(full_path_len + 1);
            strcpy(parsed.path, full_path);
        }
        free(full_path);

        cursor = cast<string>(cast<*char>(cast<long>(line_end) + 2)); # Skip \r\n

        # 2. Parse Headers
        loop {
            line_end = strstr(cursor, "\r\n");
            if (line_end == nullptr) {
                break;
            }
            if (line_end == cursor) {
                # Empty line, end of headers
                cursor = cast<string>(cast<*char>(cast<long>(line_end) + 2));
                break;
            }
            # :
            local colon: string = strchr(cursor, 58);
            if (colon != nullptr) {
                local key_len: long = cast<long>(colon) - cast<long>(cursor);
                local key: string = malloc(key_len + 1);
                strncpy(key, cursor, key_len);
                key[key_len] = cast<char>(0);

                local val_start: string = cast<string>(cast<*char>(cast<long>(colon) + 1));
                # Skip space
                if (val_start[0] == cast<char>(32)) {
                    val_start = cast<string>(cast<*char>(cast<long>(val_start) + 1));
                }
                local val_len: long = cast<long>(line_end) - cast<long>(val_start);
                local val: string = malloc(val_len + 1);
                strncpy(val, val_start, val_len);
                val[val_len] = cast<char>(0);

                # printf("DEBUG_PARSER: Header '%s'='%s'\n", key, val);

                parsed.headers.set(key, val);

                # free(key); # Map takes ownership or copies? Standard Map usually copies if string keys.
                # Checking std/map.bpl... it usually copies if designed well, or stores pointer.
                # Assuming I need to check Map implementation later. For now let's assume it copies or I leak small strings.
                # Actually std/Map usually stores keys. If it stores char*, we need to see who owns it.
                # I'll enable cleanup later if needed.
            }
            cursor = cast<string>(cast<*char>(cast<long>(line_end) + 2));
        }

        # 3. Parse Body
        # Check Content-Length
        if (parsed.headers.has("Content-Length")) {
            local cl_opt: Option<string> = parsed.headers.get("Content-Length");
            local cl_str: string = cl_opt.unwrap();
            local cl: int = atoi(cl_str);
            if (cl > 0) {
                parsed.body = malloc(cast<long>(cl + 1));
                strncpy(parsed.body, cursor, cast<long>(cl));
                parsed.body[cl] = cast<char>(0);
            }
        } else {
            # Maybe Read until end? For now handle only if CL provided or assume empty.
            if (strlen(cursor) > 0) {
                local len: long = cast<long>(strlen(cursor));
                parsed.body = malloc(len + 1);
                strcpy(parsed.body, cursor);
            }
        }

        return parsed;
    }

    frame parseQuery(qs: string, map: *Map<string, string>) {
        if (qs == nullptr) {
            return;
        }
        local cursor: string = qs;

        loop (true) {
            local eq: string = strchr(cursor, 61); # =
            local ampersand: string = strchr(cursor, 38); # &

            if (eq == nullptr) {
                break;
            }
            # Key
            local key_len: long = cast<long>(eq) - cast<long>(cursor);
            local key: string = malloc(key_len + 1);
            strncpy(key, cursor, key_len);
            key[key_len] = cast<char>(0);

            # Value
            local val_start: string = cast<string>(cast<*char>(cast<long>(eq) + 1));
            local val_len: long = 0;
            if (ampersand != nullptr) {
                val_len = cast<long>(ampersand) - cast<long>(val_start);
            } else {
                val_len = cast<long>(strlen(val_start));
            }

            local val: string = malloc(val_len + 1);
            strncpy(val, val_start, val_len);
            val[val_len] = cast<char>(0);

            map.set(key, val);

            if (ampersand == nullptr) {
                break;
            }
            cursor = cast<string>(cast<*char>(cast<long>(ampersand) + 1));
        }
    }
}

import [Request], [Response], [HttpMethod] from "./http.bpl";
import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";
import strcmp, strncmp, strlen, printf, malloc, free from "./libc.bpl";

export [Router];
export [RouteHandler];

type RouteHandler = Lambda<void>(*Request, *Response);

struct Route {
    method: HttpMethod,
    path: string,
    handler: RouteHandler,
}

frame defaultNotFoundHandler(_req: *Request, res: *Response) {
    res.status(404).send("Cannot match path");
}

struct Router {
    routes: Array<Route>,
    notFoundHandler: RouteHandler,
    frame new() ret Router {
        local r: Router;
        r.routes = Array<Route>.new(16);
        r.notFoundHandler = defaultNotFoundHandler;
        return r;
    }

    frame useNotFound(this: *Router, handler: RouteHandler) {
        this.notFoundHandler = handler;
    }

    frame get(this: *Router, path: string, handler: RouteHandler) {
        local route: Route;
        route.method = HttpMethod.GET;
        route.path = path;
        route.handler = handler;
        this.routes.push(route);
    }

    frame post(this: *Router, path: string, handler: RouteHandler) {
        local route: Route;
        route.method = HttpMethod.POST;
        route.path = path;
        route.handler = handler;
        this.routes.push(route);
    }

    frame put(this: *Router, path: string, handler: RouteHandler) {
        local route: Route;
        route.method = HttpMethod.PUT;
        route.path = path;
        route.handler = handler;
        this.routes.push(route);
    }

    frame delete(this: *Router, path: string, handler: RouteHandler) {
        local route: Route;
        route.method = HttpMethod.DELETE;
        route.path = path;
        route.handler = handler;
        this.routes.push(route);
    }

    frame handle(this: *Router, req: *Request, res: *Response) {
        local i: int = 0;
        loop (i < this.routes.len()) {
            local route: Route = this.routes.get(i);
            if (route.method == req.method) {
                if (this.matchPath(route.path, req.path, &req.params)) {
                    route.handler(req, res);
                    return;
                }
            }
            i = i + 1;
        }
        this.notFoundHandler(req, res);
    }

    frame matchPath(this: *Router, routePath: string, reqPath: string, params: *Map<string, string>) ret bool {
        # Pass 1: Check match
        local r_idx: int = 0;
        local q_idx: int = 0;
        local r_len: int = cast<int>(strlen(routePath));
        local q_len: int = cast<int>(strlen(reqPath));

        loop ((r_idx < r_len) && (q_idx < q_len)) {
            # Check for parameter
            if (routePath[r_idx] == ':') {
                # Skip route segment
                loop ((r_idx < r_len) && (routePath[r_idx] != '/')) {
                    r_idx = r_idx + 1;
                }
                # Skip req segment
                loop ((q_idx < q_len) && (reqPath[q_idx] != '/')) {
                    q_idx = q_idx + 1;
                }
            } else {
                if (routePath[r_idx] != reqPath[q_idx]) {
                    return false;
                }
                r_idx = r_idx + 1;
                q_idx = q_idx + 1;
            }
        }

        # Check if both ended
        if ((r_idx != r_len) || (q_idx != q_len)) {
            return false;
        }
        # Pass 2: Extract params
        r_idx = 0;
        q_idx = 0;
        loop ((r_idx < r_len) && (q_idx < q_len)) {
            if (routePath[r_idx] == ':') {
                r_idx = r_idx + 1; # Skip ':'
                local key_start: int = r_idx;
                loop ((r_idx < r_len) && (routePath[r_idx] != '/')) {
                    r_idx = r_idx + 1;
                }
                local key_len: int = r_idx - key_start;
                local val_start: int = q_idx;
                loop ((q_idx < q_len) && (reqPath[q_idx] != '/')) {
                    q_idx = q_idx + 1;
                }
                local val_len: int = q_idx - val_start;
                # Allocate and copy
                local key_str: *char = malloc(cast<ulong>(key_len + 1));
                local val_str: *char = malloc(cast<ulong>(val_len + 1));

                local k: int = 0;
                loop (k < key_len) {
                    key_str[k] = routePath[key_start + k];
                    k = k + 1;
                }
                key_str[key_len] = '\0';

                local v: int = 0;
                loop (v < val_len) {
                    val_str[v] = reqPath[val_start + v];
                    v = v + 1;
                }
                val_str[val_len] = '\0';

                params.set(key_str, val_str);
            } else {
                r_idx = r_idx + 1;
                q_idx = q_idx + 1;
            }
        }

        return true;
    }
}

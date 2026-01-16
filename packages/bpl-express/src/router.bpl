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

struct SubRouter {
    prefix: string,
    router: *void,
    # *Router
}

frame defaultNotFoundHandler(_req: *Request, res: *Response) {
    res.status(404).send("Cannot match path");
}

struct Router {
    routes: Array<Route>,
    middlewares: Array<RouteHandler>,
    subrouters: Array<SubRouter>,
    notFoundHandler: RouteHandler,
    frame new() ret Router {
        local r: Router;
        r.routes = Array<Route>.new(16);
        r.middlewares = Array<RouteHandler>.new(16);
        r.subrouters = Array<SubRouter>.new(4);
        r.notFoundHandler = defaultNotFoundHandler;
        return r;
    }

    frame addMiddleware(this: *Router, handler: RouteHandler) {
        # Adds a middleware handler to the router.
        # Middlewares are executed in the order they are added, before any route matching logic.
        # If a middleware sends a response (via res.send, res.json, etc.), processing stops
        # and subsequent middlewares or path-matching routes are NOT executed.
        this.middlewares.push(handler);
    }

    frame useRouter(this: *Router, path: string, router: *Router) {
        # Mounts a sub-router at a specific path prefix.
        # Example: if mounted at "/api", a route "/users" inside the sub-router
        # will match requests to "/api/users".
        # The sub-router's middlewares will run after the parent's logic delegates to it.
        # Req.path is temporarily rewritten (striped of prefix) during sub-router execution.
        local sr: SubRouter;
        sr.prefix = path;
        sr.router = router;
        this.subrouters.push(sr);
    }

    frame ping(this: *Router) {
        printf("PING\n");
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

    frame tryHandle(this: *Router, req: *Request, res: *Response) ret bool {
        # Run middlewares
        local m_i: int = 0;
        loop (m_i < this.middlewares.len()) {
            local ware: RouteHandler = this.middlewares.get(m_i);
            ware(req, res);
            if (res.body_sent) {
                return true;
            }
            m_i = m_i + 1;
        }

        # Check subrouters
        local s_i: int = 0;
        loop (s_i < this.subrouters.len()) {
            local sr: SubRouter = this.subrouters.get(s_i);
            local prefix_len: ulong = strlen(sr.prefix);
            local path_len: ulong = strlen(req.path);

            # Check prefix match
            # Note: strncmp returns 0 on match
            if (strncmp(req.path, sr.prefix, prefix_len) == 0) {
                # Check bounds to ensure we match /prefix/ or /prefix exactly
                # Avoid matching /prefixfoo
                local is_exact: bool = (path_len == prefix_len);
                local is_slash: bool = false;
                if (!is_exact) {
                    if (req.path[cast<int>(prefix_len)] == '/') {
                        is_slash = true;
                    }
                }
                if (is_exact || is_slash) {
                    local old_path: string = req.path;
                    local sub: *Router = cast<*Router>(sr.router);

                    if (is_exact) {
                        # /prefix -> /
                        req.path = "/";
                    } else {
                        # /prefix/foo -> /foo
                        # Offset pointer by prefix_len
                        # Cast via *char to satisfy type checker
                        local addr: ulong = cast<ulong>(req.path) + prefix_len;
                        req.path = cast<string>(cast<*char>(addr));
                    }

                    if (sub.tryHandle(req, res)) {
                        req.path = old_path;
                        return true;
                    }
                    req.path = old_path;
                }
            }
            s_i = s_i + 1;
        }

        local i: int = 0;
        loop (i < this.routes.len()) {
            local route: Route = this.routes.get(i);
            if (route.method == req.method) {
                if (this.matchPath(route.path, req.path, &req.params)) {
                    route.handler(req, res);
                    return true;
                }
            }
            i = i + 1;
        }
        return false;
    }

    frame handle(this: *Router, req: *Request, res: *Response) {
        if (!this.tryHandle(req, res)) {
            this.notFoundHandler(req, res);
        }
    }

    frame matchPath(this: *Router, routePath: string, reqPath: string, params: *Map<string, string>) ret bool {
        # Matches a route path pattern against the actual request path.
        # Supports:
        # 1. Exact match: "/foo/bar" matches "/foo/bar"
        # 2. Parameters: "/users/:id" matches "/users/123", extracting id="123"
        # 3. Wildcards: "/files/*" matches "/files/foo.jpg", "/files/a/b/c"
        #    The '*' character must be at the end of a segment or path to act as a wildcard.

        # Pass 1: Check match
        local r_idx: int = 0;
        local q_idx: int = 0;
        local r_len: int = cast<int>(strlen(routePath));
        local q_len: int = cast<int>(strlen(reqPath));

        loop ((r_idx < r_len) && (q_idx < q_len)) {
            if (routePath[r_idx] == '*') {
                return true;
            }
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

        # Check for trailing *
        if (r_idx < r_len) {
            if (routePath[r_idx] == '*') {
                return true;
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
            if (routePath[r_idx] == '*') {
                return true;
            }
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

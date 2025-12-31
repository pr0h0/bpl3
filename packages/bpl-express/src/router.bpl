import [Request], [Response], [HttpMethod] from "./http.bpl";
import [Array] from "std/array.bpl";
import [Map] from "std/map.bpl";
import strcmp, strncmp, strlen, printf from "./libc.bpl";

export [Router];
export [RouteHandler];

type RouteHandler = Func<void>(*Request, *Response);

struct Route {
    method: HttpMethod,
    path: string,
    handler: RouteHandler
}

struct Router {
    routes: Array<Route>,
    
    frame new() ret Router {
        local r: Router;
        r.routes = Array<Route>.new(16);
        return r;
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
            local route = this.routes.get(i);
            if (route.method == req.method) {
                if (this.matchPath(route.path, req.path, &req.params)) {
                    route.handler(req, res);
                    return;
                }
            }
            i = i + 1;
        }
        res.status(404).send("Cannot match path");
    }

    frame matchPath(this: *Router, routePath: string, reqPath: string, params: *Map<string, string>) ret bool {
        if (strcmp(routePath, reqPath) == 0) { return true; }
        
        # Hacky support for /todos/:id
        # Check if route is /todos/:id
        if (strcmp(routePath, "/todos/:id") == 0) {
             if (strncmp(reqPath, "/todos/", 7) == 0) {
                 local id_str = &reqPath[7];
                 # Ensure there is an ID
                 if (strlen(id_str) > 0) {
                     params.set("id", id_str);
                     return true;
                 }
             }
        }
        return false;
    }
}

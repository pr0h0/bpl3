import [App], [Router], [Request], [Response], [RouteHandler] from "bpl-express";
import [Type] from "std/type.bpl";
import home_handler, register_page, register_submit, login_page, login_submit, logout_handler, profile_handler, create_note_page, create_note_submit, edit_note_page, update_note_submit, delete_note_submit from "./handlers.bpl";
import create_user, create_note from "./store.bpl";
import [User] from "./models.bpl";
import logger from "./middleware.bpl";

import [printf] from "std/c.bpl";

frame api_handler(_req: *Request, res: *Response) {
    res.send(_req.path);
    res.send("\n</br>\n");
    res.send("API1 SUB-ROUTER WORKING");
}
frame api_handler2(_req: *Request, res: *Response) {
    res.send(_req.path);
    res.send("\n</br>\n");
    res.send("API2 SUB-ROUTER WORKING");
}
frame api_handler3(_req: *Request, res: *Response) {
    res.send(_req.path);
    res.send("\n</br>\n");
    res.send("API3 SUB-ROUTER WORKING");
}

frame main() {
    # Seed data
    local u: *User = create_user("demo", "demo");
    create_note(u.id, "First Note", "This is a welcome note.");
    create_note(u.id, "Another Note", "Testing the platform.");

    local app: App = App.new();

    # Middleware
    app.use(logger);

    # Sub-Router Test
    local api: Router = Router.new();
    api.get("/test", api_handler);
    api.get("/test*", api_handler2);
    api.get("/test/*", api_handler3);
    app.useRouter("/api", &api);

    app.router.get("/", home_handler);
    app.router.get("/register", register_page);
    app.router.post("/register", register_submit);
    app.router.get("/login", login_page);
    app.router.post("/login", login_submit);
    app.router.get("/logout", logout_handler);
    app.router.get("/profile", profile_handler);
    app.router.get("/notes/create", create_note_page);
    app.router.post("/notes/create", create_note_submit);

    app.router.get("/notes/:id/edit", edit_note_page);
    app.router.post("/notes/:id/update", update_note_submit);
    app.router.post("/notes/:id/delete", delete_note_submit);

    printf("Starting Tiki on http://localhost:8080\n");
    app.listen(8080);
}

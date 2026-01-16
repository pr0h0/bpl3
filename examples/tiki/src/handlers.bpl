import [Request], [Response] from "bpl-express";
import [User], [Note] from "./models.bpl";
import find_user, create_user, create_note, get_all_notes, get_user_notes, update_note, delete_note, find_note from "./store.bpl";
import parse_form, find_form_val, [KeyVal] from "./utils.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [Map] from "std/map.bpl";
import [StringBuilder] from "std/string_builder.bpl";

import atoi from "bpl-express";
extern strcmp(s1: string, s2: string) ret int;
extern free(ptr: *void);
extern strdup(s: string) ret string;

import [Home] from "./views/home.bpl";
import [Register] from "./views/register.bpl";
import [Login] from "./views/login.bpl";
import [Profile] from "./views/profile.bpl";
import [CreateNote] from "./views/create_note.bpl";
import [String] from "std/string.bpl";
import [EditNote] from "./views/edit_note.bpl";

# import render_edit_note from "./views/edit_note.bpl"; # Will add this file later, but import it now?
# Wait, if I import it before it exists, compilation might fail if I try to compile while creating.
# But I am creating files first.

extern strstr(haystack: string, needle: string) ret string;

# Auth Helper
frame get_current_user(req: *Request) ret *User {
    local cookie: string = "";
    match (req.headers.get("Cookie")) {
        Option.Some(val) => {
            cookie = val;
        },
        Option.None => {
            # Do nothing
        },
    };
    # Simple parse "user=username"
    local prefix: string = "user=";
    local found: string = strstr(cookie, prefix);
    if (found != nullptr) {
        local start: string = found + 5; # len("user=")
        # Assuming it's the only cookie or at end.
        # Should split by ; if robust.
        return find_user(start);
    }
    return nullptr;
}

frame home_handler(req: *Request, res: *Response) {
    local user: *User = get_current_user(req);
    local notes: *Note[100];
    local count: int = get_all_notes(&notes[0]);

    local html: string = Home.render(user, &notes[0], count);
    defer Home.free(html);
    res.html(html);
}

frame register_page(_req: *Request, res: *Response) {
    local html: string = Register.render(nullptr);
    defer Register.free(html);
    res.html(html);
}

frame register_submit(req: *Request, res: *Response) {
    local form: Array<KeyVal> = parse_form(req.body);
    local username: string = find_form_val(&form, "username");
    local password: string = find_form_val(&form, "password");

    if ((username == nullptr) || (password == nullptr)) {
        local html: string = Register.render("Missing fields");
        defer Register.free(html);
        res.html(html);
        return;
    }
    if (find_user(username) != nullptr) {
        local html: string = Register.render("User already exists");
        defer Register.free(html);
        res.html(html);
        return;
    }
    create_user(username, password);
    res.status(302).setHeader("Location", "/login").end();
}

frame login_page(_req: *Request, res: *Response) {
    local html: string = Login.render(nullptr);
    defer Login.free(html);
    res.html(html);
}

frame login_submit(req: *Request, res: *Response) {
    local form: Array<KeyVal> = parse_form(req.body);
    local username: string = find_form_val(&form, "username");
    local password: string = find_form_val(&form, "password");

    local user: *User = find_user(username);

    # Insecure password check
    if ((user != nullptr) && (strcmp(user.password, password) == 0)) {
        local sb: StringBuilder = StringBuilder.new(64);
        sb.append("user=");
        sb.append(username);
        sb.append("; Path=/");
        local cookie_val: string = strdup(sb.toString());

        res.setHeader("Set-Cookie", cookie_val);
        res.status(302).setHeader("Location", "/").end();

        sb.destroy();
    } else {
        local html: string = Login.render("Invalid credentials");
        defer Login.free(html);
        res.html(html);
    }
}

frame logout_handler(_req: *Request, res: *Response) {
    res.setHeader("Set-Cookie", "user=; Path=/; Max-Age=0");
    res.status(302).setHeader("Location", "/").end();
}

frame profile_handler(req: *Request, res: *Response) {
    local user: *User = get_current_user(req);
    if (user == nullptr) {
        res.status(302).setHeader("Location", "/login").end();
        return;
    }
    local notes: *Note[100];
    local count: int = get_user_notes(user.id, &notes[0]);

    local html: string = Profile.render(user, &notes[0], count);
    defer Profile.free(html);
    res.html(html);
}

frame create_note_page(req: *Request, res: *Response) {
    local user: *User = get_current_user(req);
    if (user == nullptr) {
        res.status(302).setHeader("Location", "/login").end();
        return;
    }
    local html: string = CreateNote.render(user);
    defer CreateNote.free(html);
    res.html(html);
}

frame create_note_submit(req: *Request, res: *Response) {
    local user: *User = get_current_user(req);
    if (user == nullptr) {
        res.status(302).setHeader("Location", "/login").end();
        return;
    }
    local form: Array<KeyVal> = parse_form(req.body);
    local title: string = find_form_val(&form, "title");
    local content: string = find_form_val(&form, "content");

    create_note(user.id, title, content);
    res.status(302).setHeader("Location", "/profile").end();
}

frame edit_note_page(req: *Request, res: *Response) {
    local user: *User = get_current_user(req);
    if (user == nullptr) {
        res.status(302).setHeader("Location", "/login").end();
        return;
    }
    local id_str_opt: Option<string> = req.getParam("id");
    match (id_str_opt) {
        Option.Some(id_str) => {
            local id: int = atoi(id_str);
            local note: *Note = find_note(id);
            if (note == nullptr) {
                res.status(404).text("Note not found");
                return;
            }
            # Authorization check
            if (note.user_id != user.id) {
                res.status(403).text("Forbidden");
                return;
            }
            local html: string = EditNote.render(user, note);
            defer EditNote.free(html);
            res.html(html);
        },
        Option.None => {
            res.status(400).text("Bad Request: Missing ID");
        },
    };
}

frame update_note_submit(req: *Request, res: *Response) {
    local user: *User = get_current_user(req);
    if (user == nullptr) {
        res.status(302).setHeader("Location", "/login").end();
        return;
    }
    local id_str_opt: Option<string> = req.getParam("id");
    match (id_str_opt) {
        Option.Some(id_str) => {
            local id: int = atoi(id_str);
            local note: *Note = find_note(id);
            if (note == nullptr) {
                res.status(404).text("Note not found");
                return;
            }
            if (note.user_id != user.id) {
                res.status(403).text("Forbidden");
                return;
            }
            local form: Array<KeyVal> = parse_form(req.body);
            local title: string = find_form_val(&form, "title");
            local content: string = find_form_val(&form, "content");

            update_note(id, title, content);
            res.status(302).setHeader("Location", "/profile").end();
        },
        Option.None => {
            res.status(400).text("Bad Request: Missing ID");
        },
    };
}

frame delete_note_submit(req: *Request, res: *Response) {
    local user: *User = get_current_user(req);
    if (user == nullptr) {
        res.status(302).setHeader("Location", "/login").end();
        return;
    }
    local id_str_opt: Option<string> = req.getParam("id");
    match (id_str_opt) {
        Option.Some(id_str) => {
            local id: int = atoi(id_str);
            local note: *Note = find_note(id);
            if (note == nullptr) {
                res.status(404).text("Note not found");
                return;
            }
            if (note.user_id != user.id) {
                res.status(403).text("Forbidden");
                return;
            }
            delete_note(id);
            res.status(302).setHeader("Location", "/profile").end();
        },
        Option.None => {
            res.status(400).text("Bad Request");
        },
    };
}

export home_handler;
export register_page;
export register_submit;
export login_page;
export login_submit;
export logout_handler;
export profile_handler;
export create_note_page;
export create_note_submit;
export edit_note_page;
export update_note_submit;
export delete_note_submit;

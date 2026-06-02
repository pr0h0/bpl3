import [User], [Note] from "./models.bpl";
# import [strcmp], [strcpy], [strlen], [malloc] from "libc";
import [strcmp] from "std/c.bpl";
import [strcpy] from "std/c.bpl";
import [strlen] from "std/c.bpl";
extern malloc(size: long) ret string;
import [free] from "std/c.bpl";

# Simple in-memory storage
# global const MAX_USERS = 50;
# global const MAX_NOTES = 100;

global _users: User[50];
global _users_count: int = 0;

global _notes: Note[100];
global _notes_count: int = 0;

frame strdup(s: string) ret string {
    local len: int = strlen(s);
    local p: string = cast<string>(malloc(len + 1));
    strcpy(p, s);
    return p;
}

frame find_user(username: string) ret *User {
    local i: int = 0;
    loop (i < _users_count) {
        if (strcmp(_users[i].username, username) == 0) {
            return &_users[i];
        }
        i = i + 1;
    }
    return nullptr;
}

frame create_user(username: string, password: string) ret *User {
    if (_users_count >= 50) 
        return nullptr;
    local u: *User = &_users[_users_count];
    u.id = _users_count + 1;
    u.username = strdup(username);
    u.password = strdup(password);

    _users_count = _users_count + 1;
    return u;
}

frame find_note(id: int) ret *Note {
    local i: int = 0;
    loop (i < _notes_count) {
        if (_notes[i].id == id) {
            return &_notes[i];
        }
        i = i + 1;
    }
    return nullptr;
}

frame create_note(user_id: int, title: string, content: string) ret *Note {
    if (_notes_count >= 100) 
        return nullptr;
    local n: *Note = &_notes[_notes_count];
    n.id = _notes_count + 1;
    n.user_id = user_id;
    n.title = strdup(title);
    n.content = strdup(content);

    _notes_count = _notes_count + 1;
    return n;
}

frame update_note(id: int, title: string, content: string) ret bool {
    local note: *Note = find_note(id);
    if (note == nullptr) {
        return false;
    }
    # Free old strings if we were rigorous, but for now just overwrite
    # free(cast<*void>(note.title));
    # free(cast<*void>(note.content));
    note.title = strdup(title);
    note.content = strdup(content);
    return true;
}

frame delete_note(id: int) ret bool {
    local i: int = 0;
    local found: int = -1;
    loop (i < _notes_count) {
        if (_notes[i].id == id) {
            found = i;
            break;
        }
        i = i + 1;
    }

    if (found == -1) {
        return false;
    }
    # Shift remaining
    local j: int = found;
    loop (j < (_notes_count - 1)) {
        _notes[j] = _notes[j + 1];
        j = j + 1;
    }
    _notes_count = _notes_count - 1;
    return true;
}

frame get_all_notes(out_notes: **Note) ret int {
    local count: int = 0;
    # Return in reverse order (newest first)
    local i: int = _notes_count - 1;
    loop (i >= 0) {
        if (count < 100) {
            out_notes[count] = &_notes[i];
            count = count + 1;
        }
        i = i - 1;
    }
    return count;
}

frame get_user_notes(user_id: int, out_notes: **Note) ret int {
    local count: int = 0;
    local i: int = _notes_count - 1;
    loop (i >= 0) {
        if (_notes[i].user_id == user_id) {
            if (count < 100) {
                out_notes[count] = &_notes[i];
                count = count + 1;
            }
        }
        i = i - 1;
    }
    return count;
}

export find_user;
export create_user;
export find_note;
export create_note;
export update_note;
export delete_note;
export get_all_notes;
export get_user_notes;

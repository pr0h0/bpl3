import [User] from "./types.x";
import printf, malloc, free, strcmp, strcpy from "libc";

extern malloc(size: u64) ret *u8;

global g_users_head: *User = NULL;
global g_user_id_counter: u64 = 1;

frame register_user(username: *u8, password: *u8) ret u8 {
    local current: *User = g_users_head;
    loop {
        if current == NULL {
            break;
        }
        if call strcmp(current.username, username) == 0 {
            call printf("Error: Username already exists.\n");
            return 0;
        }
        current = current.next;
    }

    local new_user: *User = call malloc(80);
    if new_user == NULL {
        call printf("Error: Memory allocation failed.\n");
        return 0;
    }

    new_user.id = g_user_id_counter;
    g_user_id_counter = g_user_id_counter + 1;
    call strcpy(new_user.username, username);
    call strcpy(new_user.password, password);
    new_user.next = g_users_head;
    g_users_head = new_user;

    call printf("User registered successfully! ID: %d\n", new_user.id);
    return 1;
}

frame login_user(username: *u8, password: *u8) ret *User {
    local current: *User = g_users_head;
    loop {
        if current == NULL {
            break;
        }
        if call strcmp(current.username, username) == 0 {
            if call strcmp(current.password, password) == 0 {
                return current;
            }
        }
        current = current.next;
    }
    return NULL;
}

export register_user;
export login_user;

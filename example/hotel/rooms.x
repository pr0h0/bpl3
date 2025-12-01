import [Room] from "./types.x";
import printf, malloc from "libc";

extern malloc(size: u64) ret *u8;

global g_rooms_head: *Room = NULL;

frame add_room(number: u32, capacity: u8, price: u32) {
    local new_room: *Room = call malloc(24);
    new_room.number = number;
    new_room.capacity = capacity;
    new_room.price = price;
    new_room.is_reserved = 0;
    new_room.next = g_rooms_head;
    g_rooms_head = new_room;
}

frame init_rooms() {
    call add_room(101, 2, 100);
    call add_room(102, 2, 100);
    call add_room(201, 4, 200);
    call add_room(301, 1, 500);
}

frame list_available_rooms() {
    call printf("\nAvailable Rooms:\n");
    local current: *Room = g_rooms_head;
    loop {
        if current == NULL {
            break;
        }
        if current.is_reserved == 0 {
            call printf("Room %d | Cap: %d | Price: $%d\n", current.number, current.capacity, current.price);
        }
        current = current.next;
    }
}

frame get_room(number: u32) ret *Room {
    local current: *Room = g_rooms_head;
    loop {
        if current == NULL {
            break;
        }
        if current.number == number {
            return current;
        }
        current = current.next;
    }
    return NULL;
}

export init_rooms;
export list_available_rooms;
export get_room;

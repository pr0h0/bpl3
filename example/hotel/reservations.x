import [Reservation], [User], [Room] from "./types.x";
import printf, malloc, free from "libc";

global g_res_head: *Reservation = NULL;
global g_res_id_counter: u64 = 1;

frame print_invoice(res: *Reservation) {
    call printf("\n--- INVOICE ---\n");
    call printf("Reservation ID: %d\n", res.id);
    call printf("User ID: %d\n", res.user_id);
    call printf("Room Number: %d\n", res.room_number);
    call printf("Nights: %d\n", res.nights);
    call printf("Total Price: $%d\n", res.total_price);
    call printf("----------------\n");
}

frame create_reservation(user: *User, room: *Room, nights: u32) {
    local res: *Reservation = call malloc(40);
    res.id = g_res_id_counter;
    g_res_id_counter = g_res_id_counter + 1;
    res.user_id = user.id;
    res.room_number = room.number;
    res.nights = nights;
    res.total_price = room.price * nights;
    res.next = g_res_head;
    g_res_head = res;

    room.is_reserved = 1;

    call printf("Reservation created successfully!\n");
    call print_invoice(res);
}

frame check_reservation(user: *User) {
    call printf("\nYour Reservations:\n");
    local current: *Reservation = g_res_head;
    local found: u8 = 0;
    loop {
        if current == NULL {
            break;
        }
        if current.user_id == user.id {
            call print_invoice(current);
            found = 1;
        }
        current = current.next;
    }
    if found == 0 {
        call printf("No reservations found.\n");
    }
}

frame change_reservation(user: *User, res_id: u64, new_nights: u32) {
    local current: *Reservation = g_res_head;
    loop {
        if current == NULL {
            break;
        }
        if current.id == res_id {
            if current.user_id == user.id {
                local price_per_night: u32 = current.total_price // current.nights;
                current.nights = new_nights;
                current.total_price = price_per_night * new_nights;
                call printf("Reservation updated.\n");
                call print_invoice(current);
                return;
            } else {
                call printf("Error: Reservation does not belong to you.\n");
                return;
            }
        }
        current = current.next;
    }
    call printf("Error: Reservation not found.\n");
}

export create_reservation;
export check_reservation;
export change_reservation;

import printf, scanf, malloc, free from "libc";

frame read_string(buffer: *u8, _max_len: u32) {
    call scanf("%s", buffer);
}

frame print_menu() {
    call printf("\n--- Hotel Management System ---\n");
    call printf("1. Login\n");
    call printf("2. Register\n");
    call printf("3. Exit\n");
    call printf("Select option: ");
}

frame print_user_menu() {
    call printf("\n--- User Menu ---\n");
    call printf("1. Reserve Room\n");
    call printf("2. Check Reservation\n");
    call printf("3. Change Reservation\n");
    call printf("4. Logout\n");
    call printf("Select option: ");
}

export read_string;
export print_menu;
export print_user_menu;

import printf from "libc";

struct Point {
    x: u64,
    y: u64
}

global points: Point[5];

frame get_rnd_u64(min: u64, max: u64) ret u64 {
    local rnd : u64 = 0;
    # Use inline assembly to get a random number from the hardware
    asm {
        rdrand rax;
        mov (rnd), rax;
    }
    if rnd < 0 {
        rnd = -rnd;
    }
    return rnd % (max - min) + min;
}

frame initialize_points() {
    local i: u64 = 0;

    # Initialize array of structs
    loop {
        if i >= 5 {
            break;
        }
        points[i].x = call get_rnd_u64(100, 900);
        points[i].y = call get_rnd_u64(points[i].x + 1, 999);
        i = i + 1;
    }
}

frame shuffle_points() {
   local i: u64 = 0;
   local j: u64 = 0;
   local temp: Point;

    # Shuffle array of structs
    local counter: u64 = 0;
    loop {
        if counter >= 100 {
            break;
        }
        i = call get_rnd_u64(0, 5);
        j = call get_rnd_u64(0, 5);

        if i == j {
           continue;
        }

        temp = points[i];
        points[i] = points[j];
        points[j] = temp;


        counter+=1;
    }
}

frame print_points() {
    local i: u64 = 0;

    # Read back and print
    loop {
        if i >= 5 {
            break;
        }
        call printf("Point[%d]: (%d, %d)\n", i, points[i].x, points[i].y);
        i = i + 1;
    }
}

frame main() ret u8 {
    call initialize_points();
    call print_points();
    call shuffle_points();
    call printf("After shuffling:\n");
    call print_points();

    return 0;
}

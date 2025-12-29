extern printf(fmt: string, ...);
extern memcpy(dest: *void, src: *void, n: int) ret *void;

struct Point<T> {
    x: T,
    y: T,
    frame new(this: *Point<T>) {
        local dummy: T = 0;
        if (dummy is int) {
            local val_x: int = 10;
            local val_y: int = 20;
            memcpy(cast<*void>(&this.x), cast<*void>(&val_x), sizeof(int));
            memcpy(cast<*void>(&this.y), cast<*void>(&val_y), sizeof(int));
            printf("Point initialized\n");
        } else if (dummy is char) {
            local val_x: char = 'a';
            local val_y: char = 'b';
            memcpy(cast<*void>(&this.x), cast<*void>(&val_x), sizeof(char));
            memcpy(cast<*void>(&this.y), cast<*void>(&val_y), sizeof(char));
            printf("Point<char> initialized\n");
        } else {
            printf("Unsupported type\n");
        }
    }
}

frame main() ret int {
    local p: Point<int>; # Should call p.new() implicitly
    printf("p.x = %d, p.y = %d\n", p.x, p.y);
    return 0;
}

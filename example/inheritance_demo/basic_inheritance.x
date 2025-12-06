import printf from "libc";

struct Point {
    x: i32,
    y: i32,

    frame init(x: i32, y: i32) {
        this.x = x;
        this.y = y;
    }

    frame print() {
        call printf("Point(%d, %d)\n", this.x, this.y);
    }
}

struct Point3D: Point {
    z: i32,

    frame init3D(x: i32, y: i32, z: i32) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    frame print3D() {
        call printf("Point3D(%d, %d, %d)\n", this.x, this.y, this.z);
    }
}

frame main() {
    local p: Point3D;
    call p.init3D(10, 20, 30);

    call printf("Accessing inherited fields: x=%d, y=%d\n", p.x, p.y);
    call printf("Accessing own field: z=%d\n", p.z);

    call printf("Calling inherited method:\n");
    call p.print();

    call printf("Calling own method:\n");
    call p.print3D();
}

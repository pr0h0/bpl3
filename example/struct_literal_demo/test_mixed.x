import printf from "libc";

struct Color {
    r: i32,
    g: i32,
    b: i32,
}

struct Point3D {
    x: i32,
    y: i32,
    z: i32,
    color: Color,
}

frame main() ret i32 {
    # Test positional initialization
    local c1: Color = {255, 128, 64};
    call printf("c1: rgb(%d, %d, %d)\n", c1.r, c1.g, c1.b);

    # Test named initialization
    local c2: Color = {b: 100, g: 200, r: 50};
    call printf("c2: rgb(%d, %d, %d)\n", c2.r, c2.g, c2.b);

    # Test nested struct initialization
    local p: Point3D = {x: 10, y: 20, z: 30, color: {r: 255, g: 255, b: 255}};
    call printf("Point: (%d, %d, %d), color: rgb(%d, %d, %d))\n", p.x, p.y, p.z, p.color.r, p.color.g, p.color.b);

    return 0;
}

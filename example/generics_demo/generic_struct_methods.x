import printf from "libc";

struct Vec2<T> {
    x: T,
    y: T,
}

# Simulate method: Vec2<u64>::add
frame add_u64(v: Vec2<u64>, other: Vec2<u64>) ret Vec2<u64> {
    local res: Vec2<u64>;
    res.x = v.x + other.x;
    res.y = v.y + other.y;
    return res;
}

# Simulate method: Vec2<f64>::add
frame add_f64(v: Vec2<f64>, other: Vec2<f64>) ret Vec2<f64> {
    local res: Vec2<f64>;
    res.x = v.x + other.x;
    res.y = v.y + other.y;
    return res;
}

frame main() ret u64 {
    local v1: Vec2<u64>;
    v1.x = 10;
    v1.y = 20;

    local v2: Vec2<u64>;
    v2.x = 30;
    v2.y = 40;

    local v3: Vec2<u64> = call add_u64(v1, v2);
    call printf("Vec2<u64>: (%lu, %lu)\n", v3.x, v3.y);

    local f1: Vec2<f64>;
    f1.x = 1.5;
    f1.y = 2.5;

    local f2: Vec2<f64>;
    f2.x = 3.5;
    f2.y = 4.5;

    local f3: Vec2<f64> = call add_f64(f1, f2);
    call printf("Vec2<f64>: (%f, %f)\n", f3.x, f3.y);
    return 0;
}

export random;
export random_range;
export distance;

# Simple Xorshift RNG
global seed: uint = 123456789;

frame random() ret uint {
    # xorshift32
    local x: uint = seed;
    x = x ^ (x << 13);
    x = x ^ (x >> 17);
    x = x ^ (x << 5);
    seed = x;
    return x;
}

frame random_range(min: int, max: int) ret int {
    local r: uint = random();
    local range: int = max - min;
    return min + cast<int>(r % cast<uint>(range));
}

frame distance(x1: int, y1: int, x2: int, y2: int) ret int {
    local dx: int = x1 - x2;
    local dy: int = y1 - y2;
    # Approximation: Manhattan distance for simplicity in grid
    if (dx < 0) 
        dx = -dx;
    if (dy < 0) 
        dy = -dy;
    return dx + dy;
}

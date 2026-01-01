# Test all enum variants

enum Color {
    Red,
    Green,
    Blue,
}

frame testRed() ret int {
    local c: Color = Color.Red;
    return match (c) {
        Color.Red => 1,
        Color.Green => 0,
        Color.Blue => 0,
    };
}

frame testGreen() ret int {
    local c: Color = Color.Green;
    return match (c) {
        Color.Red => 0,
        Color.Green => 2,
        Color.Blue => 0,
    };
}

frame testBlue() ret int {
    local c: Color = Color.Blue;
    return match (c) {
        Color.Red => 0,
        Color.Green => 0,
        Color.Blue => 3,
    };
}

frame main() ret int {
    local r: int = testRed();
    local g: int = testGreen();
    local b: int = testBlue();

    # Should return 6 if all tests pass (1 + 2 + 3)
    return r + g + b;
}

export [Shade];
export [Shape];

enum Shade {
    Light,
    Dark(int),
}

enum Shape {
    Circle { radius: int, shade: Shade },
    Square(int),
}

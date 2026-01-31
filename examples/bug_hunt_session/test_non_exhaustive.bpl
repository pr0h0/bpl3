# Bug Hunt: Non-exhaustive Match
extern printf(fmt: string, ...);

enum Color {
    Red,
    Green,
    Blue,
}

frame main() {
    local c: Color = Color.Green;

    # Non-exhaustive match - missing Green and Blue
    match (c) {
        Color.Red => printf("Red\n"),
    };
    printf("Done\n");
}

import [Option] from "std/option.bpl";
extern printf(fmt: string, ...);

enum Color {
    Red,
    Green,
    Blue,
}

enum Message {
    Quit,
    Move(int, int),
    Write(string),
}

frame printColor(c: Color) {
    match (c) {
        Color.Red => printf("Color is Red\n"),
        Color.Green => printf("Color is Green\n"),
        Color.Blue => printf("Color is Blue\n"),
    };
}

frame processMessage(msg: Message) {
    match (msg) {
        Message.Quit => printf("Message: Quit\n"),
        Message.Move(x, y) => printf("Message: Move to (%d, %d)\n", x, y),
        Message.Write(s) => printf("Message: Write '%s'\n", s),
    };
}

frame printOption(opt: Option<int>) {
    match (opt) {
        Option<int>.Some(val) => printf("Option: Some(%d)\n", val),
        Option<int>.None => printf("Option: None\n"),
    };
}

frame main() ret int {
    printf("--- Enum Test ---\n");

    # Test Unit Variants
    local c1: Color = Color.Red;
    printColor(c1);
    printColor(Color.Green);

    # Test Tuple Variants
    local m1: Message = Message.Quit;
    processMessage(m1);

    local m2: Message = Message.Move(10, 20);
    processMessage(m2);

    local m3: Message = Message.Write("Hello BPL");
    processMessage(m3);

    # Test Generic Enums
    local o1: Option<int> = Option<int>.Some(42);
    printOption(o1);

    local o2: Option<int> = Option<int>.None;
    printOption(o2);

    return 0;
}

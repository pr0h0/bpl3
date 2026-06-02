import [printf] from "std/c.bpl";

enum Message {
    Quit,
    Move(int, int),
    Write(string),
    ChangeColor(int, int, int),
}

frame process(msg: Message) {
    if (match<Message.Quit>(msg)) {
        printf("Quitting\n");
        return;
    }
    if (match<Message.Move>(msg)) {
        printf("Moving\n");
        # We can then match to extract data
        match (msg) {
            Message.Move(x, y) => {
                printf("To %d, %d\n", x, y);
            },
            Message.Quit => {
            },
            Message.Write(_) => {
            },
            Message.ChangeColor(_, _, _) => {
            },
        };
        return;
    }
    printf("Other message\n");
}

frame main() ret int {
    process(Message.Quit);
    process(Message.Move(10, 20));
    process(Message.Write("hello"));
    return 0;
}

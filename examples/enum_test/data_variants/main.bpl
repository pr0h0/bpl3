# Test enum variants with associated data

enum Message {
    Quit,
    Move(int, int),
    Write(string),
}

frame main() ret int {
    # Test unit variant
    local _quit: Message = Message.Quit;

    # Test tuple variant with data
    local _move_msg: Message = Message.Move(10, 20);

    # Test another tuple variant
    local _write_msg: Message = Message.Write("hello");

    return 0;
}

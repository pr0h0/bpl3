import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

extern malloc(size: i64) ret *void;
extern free(ptr: *void) ret void;

frame demo_array() {
    IO.log("--- Demo Array<int> ---");
    local arr: Array<int> = Array<int>.new(2);

    # Test push and growth
    IO.log("Pushing 10, 20, 30 (triggers growth)...");
    arr.push(10);
    arr.push(20);
    arr.push(30);

    local len: int = arr.len();
    IO.printf("Length: %d\n", len);

    # Test get
    local val0: int = arr.get(0);
    local val1: int = arr.get(1);
    local val2: int = arr.get(2);
    IO.printf("Index 0: %d\n", val0);
    IO.printf("Index 1: %d\n", val1);
    IO.printf("Index 2: %d\n", val2);

    # Test set
    IO.log("Setting index 1 to 99...");
    arr.set(1, 99);
    local val1_new: int = arr.get(1);
    IO.printf("Index 1 is now: %d\n", val1_new);

    arr.destroy();
    IO.log("Array destroyed.");
}

frame demo_array_string() {
    IO.log("\n--- Demo Array<String> ---");
    local arr: Array<String> = Array<String>.new(2);

    IO.log("Pushing strings...");
    local s1: String = String.new("Hello");
    local s2: String = String.new("World");
    local s3: String = String.new("BPL");

    arr.push(s1);
    arr.push(s2);
    arr.push(s3);

    local len: int = arr.len();
    IO.printf("Length: %d\n", len);

    local i: int = 0;
    loop (i < len) {
        local s: String = arr.get(i);
        IO.printString(s.cstr());
        i = i + 1;
    }

    # Cleanup strings
    IO.log("Cleaning up strings...");
    i = 0;
    loop (i < len) {
        local s: String = arr.get(i);
        s.destroy();
        i = i + 1;
    }

    arr.destroy();
    IO.log("Array<String> destroyed.");
}

frame demo_string() {
    IO.log("\n--- Demo String ---");
    local s: String = String.new("Hello String");
    IO.printString(s.cstr());
    s.destroy();
}

frame demo_io() {
    IO.log("\n--- Demo IO ---");
    IO.log("IO.log test");
    IO.printInt(12345);

    # Test read (scanf)
    IO.log("Enter a number:");
    local num: int;
    IO.read("%d", cast<*void>(&num));
    IO.printf("You entered: %d\n", num);

    # Consume newline left by scanf
    local dummy: char;
    IO.read("%c", cast<*void>(&dummy));

    # Test readLine
    IO.log("Enter text:");
    local buf: *char = cast<*char>(malloc(cast<i64>(100)));
    # Note: gets is unsafe, but used here for simplicity in demo
    local len: int = IO.readLine(buf);
    # Remove newline if present (gets usually keeps it or not? gets removes newline, fgets keeps it. 
    # Wait, C gets() removes the newline. But IO.readLine calls gets.
    # Let's assume input "input" results in "input" in buffer.

    IO.printf("Read %d chars: ", len);
    IO.printString(buf);

    free(cast<*void>(buf));
}

frame main() ret i32 {
    demo_array();
    demo_array_string();
    demo_string();
    demo_io();
    return 0;
}

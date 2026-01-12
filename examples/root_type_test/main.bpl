# Test for Root Global Type Struct
# This test verifies that a user-defined struct implicitly inherits from Type
# and can call its methods.

import [Type] from "std/type.bpl";
import [IO] from "std/io.bpl";

struct MyStruct {
    x: int,
    y: int,
    frame getTypeName(this: *MyStruct) ret string {
        return "MyStruct";
    }
}

frame main() {
    local s: MyStruct = MyStruct { x: 10, y: 20 };
    local ptr: *MyStruct = &s;

    # Check if we can call getTypeName() (inherited from Type)
    # Note: The default implementation returns "Type", but we can override it later
    # or the compiler can generate an override.
    # For now, we just check if the method exists and is callable.

    local name: string = ptr.getTypeName();
    IO.print("Type name: ");
    IO.printString(name);
    IO.print("\n");

    local str: string = ptr.toString();
    IO.print("ToString: ");
    IO.printString(str);
    IO.print("\n");
}

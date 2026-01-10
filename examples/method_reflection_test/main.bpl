import [TypeInfo], [MethodInfo] from "std/reflection.bpl";
import [IO] from "std/io.bpl";

struct User {
    id: int,
    frame toJson(this: *User) ret string {
        return "Custom User JSON";
    }
}

frame main() {
    local u: User;
    u.id = 123;

    local info: *TypeInfo = typeof<User>();

    IO.print("Type: ");
    IO.print(info.name);
    IO.print("\n");
    IO.print("Methods: ");
    IO.printInt(info.num_methods);
    IO.print("\n");

    local i: int = 0;
    loop (i < info.num_methods) {
        IO.print("  - ");
        IO.print(info.methods[i].name);
        IO.print("\n");
        i = i + 1;
    }
}

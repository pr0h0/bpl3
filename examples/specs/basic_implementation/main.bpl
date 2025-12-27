import [String] from "std/string.bpl";
extern printf(fmt: string, ...);

spec Printable {
    frame print(this: *Self);
}

struct User: Printable {
    name: String,
    age: int,
    frame print(this: *User) {
        printf("User: %s, Age: %d\n", this.name.toString(), this.age);
    }
}

frame main() {
    local u: User = User { name: String.new("Alice"), age: 30 };

    u.print();
}

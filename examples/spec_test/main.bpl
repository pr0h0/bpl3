import [printf] from "std/c.bpl";

spec Disposable {
    frame destroy(this: *Self);
}

spec Named {
    frame getName(this: *Self) ret string;
}

spec ReadWriter: Reader {
    frame write(this: *Self, data: string);
}

struct User: Disposable, Named {
    name: string,
    frame destroy(this: *User) {
        printf("Destroying user: %s\n", this.name);
    }

    frame getName(this: *User) ret string {
        return this.name;
    }
}

frame main() {
    local u: User = User { name: "test" };
    u.destroy();
}

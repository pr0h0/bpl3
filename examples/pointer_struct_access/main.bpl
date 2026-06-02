import [malloc] from "std/c.bpl";
import [free] from "std/c.bpl";
import [printf] from "std/c.bpl";

struct Address {
    zip: int,
}

struct User {
    id: int,
    age: int,
    addr: Address,
    frame print(this: User) {
        printf("User(id=%d, age=%d, zip=%d)\n", this.id, this.age, this.addr.zip);
    }

    frame new(id: int, age: int, zip: int) ret User {
        local u: User;
        u.id = id;
        u.age = age;
        u.addr.zip = zip;
        return u;
    }

    frame setAge(this: *User, newAge: int) {
        this.age = newAge;
    }
}

frame main() ret int {
    local size: int = sizeof<User>() * 3;
    local users: *User = cast<*User>(malloc(size));

    # Initialize users
    users[0] = User.new(1, 20, 10001);
    users[1] = User.new(2, 30, 20002);
    users[2] = User.new(3, 40, 30003);

    # Test property access
    printf("users[1].age = %d\n", users[1].age);
    printf("users[1].addr.zip = %d\n", users[1].addr.zip);

    # Test method access (by value)
    users[0].print();

    # Test method access (by pointer) - checking if auto-ref works or if we need explicit &
    users[2].setAge(41);
    printf("users[2].age after setAge = %d\n", users[2].age);

    free(cast<*void>(users));
    return 0;
}

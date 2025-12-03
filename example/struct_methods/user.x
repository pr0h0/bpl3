import printf from "libc";

struct User {
    name: *u8,
    age: i32,

    frame sayHello() {
        call printf("Hello, my name is %s and I am %d years old\n", this.name, this.age);
    }

    frame setAge(newAge: i32) {
        this.age = newAge;
    }

    frame isAdult() ret i8 {
        if this.age >= 18 {
            return 1;
        }
        return 0;
    }
}

frame main() ret i32 {
    local user: User;
    user.name = "Alice";
    user.age = 25;

    call user.sayHello();

    call user.setAge(30);
    call printf("After setAge: ");
    call user.sayHello();

    local adult: i8 = call user.isAdult();
    if adult {
        call printf("User is an adult\n");
    } else {
        call printf("User is not an adult\n");
    }

    return 0;
}

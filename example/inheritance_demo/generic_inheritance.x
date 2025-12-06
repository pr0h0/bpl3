import printf from "libc";

struct Base {
    id: i32,

    frame initBase(id: i32) {
        this.id = id;
    }

    frame printId() {
        call printf("Base ID: %d\n", this.id);
    }
}

struct Container<T>: Base {
    value: T,

    frame init(id: i32, val: T) {
        this.id = id;
        this.value = val;
    }

    frame printValue() {
        call this.printId();
        # We can't easily print T generically without traits/interfaces, 
        # but we can verify the method call and field access works.
        call printf("Container initialized.\n");
    }

    frame getValue() ret T {
        return this.value;
    }
}

frame main() {
    local c: Container<i32>;
    call c.init(123, 456);

    call c.printValue();

    local val: i32 = call c.getValue();
    call printf("Value retrieved: %d\n", val);

    # Test with another type
    local c2: Container<i64>;
    call c2.init(999, 1000);
    call c2.printValue();
}

extern printf(fmt: string, ...);

struct Base {
    id: int,
    frame identify(this: *Base) {
        printf("Base ID: %d\n", this.id);
    }
}

spec Resettable {
    frame reset(this: *Self);
}

struct Derived: Base, Resettable {
    value: int,
    frame reset(this: *Derived) {
        this.value = 0;
        printf("Reset value to 0\n");
    }

    frame print(this: *Derived) {
        printf("Derived ID: %d, Value: %d\n", this.id, this.value);
    }
}

frame main() {
    local d: Derived = Derived { id: 1, value: 100 };

    local ptr: *Derived = &d;

    # Explicit cast to call inherited method
    local basePtr: *Base = cast<*Base>(ptr);
    basePtr.identify();

    ptr.print();
    ptr.reset(); # Implemented from Spec
    ptr.print();
}

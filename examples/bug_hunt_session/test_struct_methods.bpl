# Bug Hunt: Struct Method Edge Cases
extern printf(fmt: string, ...);

# Test 1: Method chaining
struct Chainable {
    x: int,

    frame setX(this: *Chainable, val: int) ret *Chainable {
        this.x = val;
        return this;
    }

    frame addX(this: *Chainable, val: int) ret *Chainable {
        this.x = this.x + val;
        return this;
    }
}

# Test 2: Method on generic struct
struct Container<T> {
    value: T,

    frame get(this: *Container<T>) ret T {
        return this.value;
    }

    frame set(this: *Container<T>, val: T) {
        this.value = val;
    }
}

# Test 3: Static-like method (no this)
struct Math {
    frame max(a: int, b: int) ret int {
        if (a > b) {
            return a;
        }
        return b;
    }
}

# Test 4: Inherited method override
struct Base {
    x: int,

    frame print(this: *Base) {
        printf("Base: %d\n", this.x);
    }
}

struct Derived: Base {
    y: int,

    frame print(this: *Derived) {
        printf("Derived: x=%d, y=%d\n", this.x, this.y);
    }
}

frame main() {
    # Test method chaining
    local c: Chainable = Chainable { x: 0 };
    c.setX(10).addX(5);
    printf("Chained value: %d\n", c.x);

    # Test generic method
    local cont: Container<int> = Container<int> { value: 42 };
    printf("Container value: %d\n", cont.get());
    cont.set(100);
    printf("After set: %d\n", cont.get());

    # Test static method
    local m: int = Math.max(10, 20);
    printf("Max: %d\n", m);

    # Test inheritance
    local base: Base = Base { x: 10 };
    local derived: Derived = Derived { x: 20, y: 30 };
    base.print();
    derived.print();

    # Test slicing - calling through base pointer
    local basePtr: *Base = cast<*Base>(&derived);
    basePtr.print(); # Should call Derived.print due to vtable

    printf("Struct method tests done\n");
}

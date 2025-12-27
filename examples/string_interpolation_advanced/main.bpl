import [String] from "std";
extern printf(fmt: string, ...);

frame getGreeting() ret String {
    return String.new("Greetings");
}

struct Point {
    x: int,
    y: int,
    frame toString(this: Point) ret String {
        return `(${this.x}, ${this.y})`;
    }
}

frame main() ret int {
    # Function call in interpolation
    local greeting: String = getGreeting();
    local s1: String = `${greeting} from advanced example!`;
    printf("%s\n", s1.toString());
    greeting.destroy();
    s1.destroy();

    # Struct with toString method
    local p: Point;
    p.x = 10;
    p.y = 20;
    # Note: Implicit toString call on struct might require the struct to be passed by value or pointer depending on implementation
    # The docs say "expression result". If p is Point, p.toString() is called.
    local s2: String = `Point is ${p}`;
    printf("%s\n", s2.toString());
    s2.destroy();

    # Complex expression
    local x: int = 5;
    local s3: String = `Result: ${x > 0 ? "Positive" : "Negative"}`;
    printf("%s\n", s3.toString());
    s3.destroy();

    # Escaping in interpolation
    local s4: String = `Escaped: \${x} = ${x}`;
    printf("%s\n", s4.toString());
    s4.destroy();

    # Struct literal in interpolation
    local s5: String = `Literal Point: ${Point { x: 100, y: 200 }}`;
    printf("%s\n", s5.toString());
    s5.destroy();

    # --- New Advanced Tests ---

    # 1. Array Literal (using helper)
    # Note: Arrays don't have implicit toString, so we use a helper
    # local s_arr: String = `Array: ${[1, 2, 3]}`;
    # printf("%s\n", s_arr.toString());
    # s_arr.destroy();

    # 2. Pointer (using helper)
    local val: int = 42;
    local ptr: *int = &val;
    local s_ptr: String = `Pointer: ${ptr}`;
    printf("%s\n", s_ptr.toString());
    s_ptr.destroy();

    # 3. Enum
    local status: Status = Status.Active;
    local s_enum: String = `Status: ${status}`;
    printf("%s\n", s_enum.toString());
    s_enum.destroy();

    # 4. Ternary Operator
    local cond: bool = true;
    local s_ternary: String = `Ternary: ${cond ? "True" : "False"}`;
    printf("%s\n", s_ternary.toString());
    s_ternary.destroy();

    # 5. Function Call
    local s_call: String = `Function: ${getGreeting()}`;
    printf("%s\n", s_call.toString());
    s_call.destroy();

    # 6. Arithmetic Addition
    local s_arith: String = `Arithmetic: ${10 + 20}`;
    printf("%s\n", s_arith.toString());
    s_arith.destroy();

    # 7. Struct Addition (Operator Overloading)
    local v1: Vector;
    v1.x = 1;
    v1.y = 2;
    local v2: Vector;
    v2.x = 3;
    v2.y = 4;
    local s_vec: String = `Vector Sum: ${v1 + v2}`;
    printf("%s\n", s_vec.toString());
    s_vec.destroy();

    return 0;
}

enum Status {
    Active,
    Inactive,

    frame toString(this: Status) ret String {
        return match (this) {
            Status.Active => String.new("Active"),
            Status.Inactive => String.new("Inactive"),
        };
    }
}

struct Vector {
    x: int,
    y: int,
    frame toString(this: Vector) ret String {
        return `Vector(${this.x}, ${this.y})`;
    }

    frame __add__(this: *Vector, b: *Vector) ret Vector {
        local v: Vector;
        v.x = this.x + b.x;
        v.y = this.y + b.y;
        return v;
    }
}

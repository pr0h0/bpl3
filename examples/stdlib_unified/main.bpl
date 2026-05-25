# Example demonstrating the unified standard library with new features

import [IO], [Array], [String], [Map], [Math], [Range], [StringBuilder], [Option], [Result], [Set], [Vec2] from "std";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    IO.printString("=== Unified Standard Library Demo ===");
    IO.print("");

    # === String with Operators ===
    IO.printString("--- String Operators ---");
    local s1: String = String.new("Hello");
    local s2: String = s1 + " World"; # + operator for concatenation
    IO.print("Concatenation: ");
    IO.printString(s2.toString());

    local s3: String = String.new("Apple");
    local s4: String = String.new("Banana");
    if (s3 < s4) {
        # < operator for comparison
        IO.printString("Apple < Banana: true");
    }
    local s5: String = String.new("Builder");
    s5 << " text"; # << operator for in-place concat
    IO.print("In-place concat: ");
    IO.printString(s5.toString());

    s1.destroy();
    s2.destroy();
    s3.destroy();
    s4.destroy();
    s5.destroy();
    IO.print("");

    # === StringBuilder - New! ===
    IO.printString("--- StringBuilder (NEW) ---");
    local sb: StringBuilder = StringBuilder.newDefault();
    sb << "Efficient " << "string " << "building";
    sb.append(" with ");
    sb.appendInt(123);
    IO.print("Result: ");
    IO.printString(sb.toString());
    sb.destroy();
    IO.print("");

    # === Range - New! ===
    IO.printString("--- Range (NEW) ---");
    local range: Range = Range.between(1, 6);
    IO.print("Range elements: ");
    local i: int = 0;
    loop (i < range.len()) {
        IO.printIntLn(range[i]); # [] operator for indexing
        IO.print(" ");
        i = i + 1;
    }
    IO.print("");

    local r1: Range = Range.between(0, 5);
    local r2: Range = Range.between(0, 5);
    if (r1 == r2) {
        # == operator for equality
        IO.printString("Range equality works!");
    }
    IO.print("");

    # === Option with Operators ===
    IO.printString("--- Option Operators ---");
    local opt1: Option<int> = Option<int>.Some(42);
    local opt2: Option<int> = Option<int>.Some(42);
    local opt3: Option<int> = Option<int>.None;

    if (opt1 == opt2) {
        # equality comparison
        IO.printString("Some(42) == Some(42): true");
    }
    # inequality comparison
    if (opt1 != opt3) {
        IO.printString("Some(42) != None: true");
    }
    IO.print("");

    # === Result with Operators ===
    IO.printString("--- Result Operators ---");
    local res1: Result<int, int> = Result<int, int>.Ok(100);
    local res2: Result<int, int> = Result<int, int>.Ok(100);
    local res3: Result<int, int> = Result<int, int>.Err(1);

    if (res1.__eq__(&res2)) {
        # equality comparison
        IO.printString("Ok(100) == Ok(100): true");
    }
    # inequality comparison
    if (res1.__ne__(&res3)) {
        IO.printString("Ok(100) != Err(1): true");
    }
    IO.print("");

    # === Set with Operators ===
    IO.printString("--- Set Operators ---");
    local set1: Set<int> = Set<int>.new(10);
    set1.add(1);
    set1.add(2);
    set1.add(3);

    local set2: Set<int> = Set<int>.new(10);
    set2.add(2);
    set2.add(3);
    set2.add(4);

    local union_set: Set<int> = set1.union(&set2); # union operation
    IO.print("Union size: ");
    IO.printIntLn(union_set.size());

    local intersection: Set<int> = set1.intersection(&set2); # intersection operation
    IO.print("Intersection size: ");
    IO.printIntLn(intersection.size());

    local difference: Set<int> = set1.difference(&set2); # difference operation
    IO.print("Difference size: ");
    IO.printIntLn(difference.size());

    set1.destroy();
    set2.destroy();
    union_set.destroy();
    intersection.destroy();
    difference.destroy();
    IO.print("");

    # === Vec2 with Operators ===
    IO.printString("--- Vec2 Operators ---");
    local v1: Vec2 = Vec2.new(1.0, 2.0);
    local v2: Vec2 = Vec2.new(3.0, 4.0);

    local v3: Vec2 = v1 + v2; # + operator for vector addition
    printf("Vector addition: (%.1f, %.1f)\n", v3.x, v3.y);

    local v4: Vec2 = v2 - v1; # - operator for subtraction
    printf("Vector subtraction: (%.1f, %.1f)\n", v4.x, v4.y);

    local v5: Vec2 = v1 * 2.0; # * operator for scalar multiplication
    printf("Vector scaling: (%.1f, %.1f)\n", v5.x, v5.y);

    local v6: Vec2 = -v1; # unary - operator for negation
    printf("Vector negation: (%.1f, %.1f)\n", v6.x, v6.y);

    if (v1 != v2) {
        # != operator for inequality
        IO.printString("Vec2 comparison works!");
    }
    IO.print("");

    # === Traditional Usage ===
    IO.printString("--- Traditional Features ---");

    local arr: Array<int> = Array<int>.new(5);
    arr.push(10);
    arr.push(20);
    arr.push(30);
    IO.print("Array size: ");
    IO.printIntLn(arr.len());
    arr.destroy();

    local m: Map<int, int> = Map<int, int>.new(10);
    m.set(1, 100);
    m.set(2, 200);
    IO.print("Map get(1): ");
    if (m.has(1)) {
        IO.printIntLn(m.get(1).unwrap());
    }
    m.destroy();

    IO.print("Math.min(5, 10): ");
    IO.printIntLn(Math.min(5, 10));
    IO.print("");

    IO.printString("=== Demo Complete ===");
    return 0;
}

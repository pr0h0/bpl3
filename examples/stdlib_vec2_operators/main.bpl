# Vec2 operator overloading showcase

import [Vec2] from "std/vec2.bpl";
import [printf] from "std/c.bpl";

frame main() ret int {
    printf("=== Vec2 Operator Overloading ===\n\n");

    # Test vector addition with +
    printf("--- Vector Addition (+) ---\n");
    local v1: Vec2 = Vec2.new(3.0, 4.0);
    local v2: Vec2 = Vec2.new(1.0, 2.0);
    local sum: Vec2 = v1 + v2;
    printf("Vec2(%.1f, %.1f) + Vec2(%.1f, %.1f) = Vec2(%.1f, %.1f)\n", v1.x, v1.y, v2.x, v2.y, sum.x, sum.y);
    printf("\n");

    # Test vector subtraction with -
    printf("--- Vector Subtraction (-) ---\n");
    local diff: Vec2 = v1 - v2;
    printf("Vec2(%.1f, %.1f) - Vec2(%.1f, %.1f) = Vec2(%.1f, %.1f)\n", v1.x, v1.y, v2.x, v2.y, diff.x, diff.y);
    printf("\n");

    # Test scalar multiplication with *
    printf("--- Scalar Multiplication (*) ---\n");
    local scaled: Vec2 = v1 * 2.0;
    printf("Vec2(%.1f, %.1f) * 2.0 = Vec2(%.1f, %.1f)\n", v1.x, v1.y, scaled.x, scaled.y);
    printf("\n");

    # Test scalar division with /
    printf("--- Scalar Division (/) ---\n");
    local divided: Vec2 = v1 / 2.0;
    printf("Vec2(%.1f, %.1f) / 2.0 = Vec2(%.1f, %.1f)\n", v1.x, v1.y, divided.x, divided.y);
    printf("\n");

    # Test unary negation with -
    printf("--- Unary Negation (-) ---\n");
    local negated: Vec2 = -v1;
    printf("-Vec2(%.1f, %.1f) = Vec2(%.1f, %.1f)\n", v1.x, v1.y, negated.x, negated.y);
    printf("\n");

    # Test equality with ==
    printf("--- Equality (==) ---\n");
    local v3: Vec2 = Vec2.new(3.0, 4.0);
    local v4: Vec2 = Vec2.new(5.0, 6.0);

    if (v1 == v3) {
        printf("Vec2(%.1f, %.1f) == Vec2(%.1f, %.1f): true\n", v1.x, v1.y, v3.x, v3.y);
    } else {
        printf("Vec2(%.1f, %.1f) == Vec2(%.1f, %.1f): false\n", v1.x, v1.y, v3.x, v3.y);
    }

    if (v1 == v4) {
        printf("Vec2(%.1f, %.1f) == Vec2(%.1f, %.1f): true\n", v1.x, v1.y, v4.x, v4.y);
    } else {
        printf("Vec2(%.1f, %.1f) == Vec2(%.1f, %.1f): false\n", v1.x, v1.y, v4.x, v4.y);
    }
    printf("\n");

    # Test inequality with !=
    printf("--- Inequality (!=) ---\n");
    if (v1 != v4) {
        printf("Vec2(%.1f, %.1f) != Vec2(%.1f, %.1f): true\n", v1.x, v1.y, v4.x, v4.y);
    } else {
        printf("Vec2(%.1f, %.1f) != Vec2(%.1f, %.1f): false\n", v1.x, v1.y, v4.x, v4.y);
    }
    printf("\n");

    # Test complex expression
    printf("--- Complex Expression ---\n");
    local result: Vec2 = ((v1 + v2) * 2.0) - v3;
    printf("((%.1f, %.1f) + (%.1f, %.1f)) * 2.0 - (%.1f, %.1f) = (%.1f, %.1f)\n", v1.x, v1.y, v2.x, v2.y, v3.x, v3.y, result.x, result.y);
    printf("\n");

    # Test chained operations
    printf("--- Chained Operations ---\n");
    local chained: Vec2 = v1 + v2 + v3;
    printf("(%.1f, %.1f) + (%.1f, %.1f) + (%.1f, %.1f) = (%.1f, %.1f)\n", v1.x, v1.y, v2.x, v2.y, v3.x, v3.y, chained.x, chained.y);

    printf("\n=== All Vec2 Operator Tests Complete ===\n");
    return 0;
}

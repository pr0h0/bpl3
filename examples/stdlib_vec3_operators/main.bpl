# Vec3 operator overloading showcase

import [Vec3] from "std/vec3.bpl";
import [printf] from "std/c.bpl";

frame main() ret int {
    printf("=== Vec3 Operator Overloading ===\n\n");

    # Test vector addition with +
    printf("--- Vector Addition (+) ---\n");
    local v1: Vec3 = Vec3.new(1.0, 2.0, 3.0);
    local v2: Vec3 = Vec3.new(4.0, 5.0, 6.0);
    local sum: Vec3 = v1 + v2;
    printf("Vec3(%.1f, %.1f, %.1f) + Vec3(%.1f, %.1f, %.1f) = Vec3(%.1f, %.1f, %.1f)\n", v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, sum.x, sum.y, sum.z);
    printf("\n");

    # Test vector subtraction with -
    printf("--- Vector Subtraction (-) ---\n");
    local diff: Vec3 = v2 - v1;
    printf("Vec3(%.1f, %.1f, %.1f) - Vec3(%.1f, %.1f, %.1f) = Vec3(%.1f, %.1f, %.1f)\n", v2.x, v2.y, v2.z, v1.x, v1.y, v1.z, diff.x, diff.y, diff.z);
    printf("\n");

    # Test scalar multiplication with *
    printf("--- Scalar Multiplication (*) ---\n");
    local scaled: Vec3 = v1 * 2.0;
    printf("Vec3(%.1f, %.1f, %.1f) * 2.0 = Vec3(%.1f, %.1f, %.1f)\n", v1.x, v1.y, v1.z, scaled.x, scaled.y, scaled.z);
    printf("\n");

    # Test scalar division with /
    printf("--- Scalar Division (/) ---\n");
    local divided: Vec3 = v2 / 2.0;
    printf("Vec3(%.1f, %.1f, %.1f) / 2.0 = Vec3(%.1f, %.1f, %.1f)\n", v2.x, v2.y, v2.z, divided.x, divided.y, divided.z);
    printf("\n");

    # Test unary negation with -
    printf("--- Unary Negation (-) ---\n");
    local negated: Vec3 = -v1;
    printf("-Vec3(%.1f, %.1f, %.1f) = Vec3(%.1f, %.1f, %.1f)\n", v1.x, v1.y, v1.z, negated.x, negated.y, negated.z);
    printf("\n");

    # Test equality with ==
    printf("--- Equality (==) ---\n");
    local v3: Vec3 = Vec3.new(1.0, 2.0, 3.0);
    local v4: Vec3 = Vec3.new(7.0, 8.0, 9.0);

    if (v1 == v3) {
        printf("Vec3(%.1f, %.1f, %.1f) == Vec3(%.1f, %.1f, %.1f): true\n", v1.x, v1.y, v1.z, v3.x, v3.y, v3.z);
    } else {
        printf("Vec3(%.1f, %.1f, %.1f) == Vec3(%.1f, %.1f, %.1f): false\n", v1.x, v1.y, v1.z, v3.x, v3.y, v3.z);
    }

    if (v1 == v4) {
        printf("Vec3(%.1f, %.1f, %.1f) == Vec3(%.1f, %.1f, %.1f): true\n", v1.x, v1.y, v1.z, v4.x, v4.y, v4.z);
    } else {
        printf("Vec3(%.1f, %.1f, %.1f) == Vec3(%.1f, %.1f, %.1f): false\n", v1.x, v1.y, v1.z, v4.x, v4.y, v4.z);
    }
    printf("\n");

    # Test inequality with !=
    printf("--- Inequality (!=) ---\n");
    if (v1 != v4) {
        printf("Vec3(%.1f, %.1f, %.1f) != Vec3(%.1f, %.1f, %.1f): true\n", v1.x, v1.y, v1.z, v4.x, v4.y, v4.z);
    } else {
        printf("Vec3(%.1f, %.1f, %.1f) != Vec3(%.1f, %.1f, %.1f): false\n", v1.x, v1.y, v1.z, v4.x, v4.y, v4.z);
    }
    printf("\n");

    # Test complex expression
    printf("--- Complex Expression ---\n");
    local result: Vec3 = (v1 + v2) / 2.0;
    printf("((%.1f, %.1f, %.1f) + (%.1f, %.1f, %.1f)) / 2.0 = (%.1f, %.1f, %.1f)\n", v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, result.x, result.y, result.z);

    printf("\n=== All Vec3 Operator Tests Complete ===\n");
    return 0;
}

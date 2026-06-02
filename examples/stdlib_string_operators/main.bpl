# String operator overloading showcase

import [String] from "std/string.bpl";
import [printf] from "std/c.bpl";

frame main() ret int {
    printf("=== String Operator Overloading ===\n\n");

    # Test string concatenation with +
    printf("--- String Concatenation (+) ---\n");
    local hello: String = String.new("Hello");
    local world: String = String.new(" World");
    local greeting: String = hello + world;
    printf("'%s' + '%s' = '%s'\n", hello.toString(), world.toString(), greeting.toString());
    greeting.destroy();

    local first: String = String.new("BPL");
    local space: String = String.new(" ");
    local second: String = String.new("is");
    local third: String = String.new(" awesome!");
    local sentence: String = first + space + second + third;
    printf("Chained with +: '%s'\n\n", sentence.toString());
    sentence.destroy();

    # Test in-place concatenation with <<
    printf("--- In-place Concatenation (<<) ---\n");
    local builder: String = String.new("Hello");
    printf("Initial: '%s'\n", builder.toString());
    builder << String.new(" ");
    printf("After << ' ': '%s'\n", builder.toString());
    builder << String.new("World");
    printf("After << 'World': '%s'\n", builder.toString());
    builder << String.new("!");
    printf("After << '!': '%s'\n", builder.toString());
    printf("\n");

    # String Literal Support (no String.new() needed)
    printf("--- String Literal Support ---\n");
    local lit1: String = String.new("Direct");
    local lit2: String = lit1 + " literals"; # No String.new() needed!
    printf("lit1 + \" literals\": '%s'\n", lit2.toString());
    lit2.destroy();

    lit1 << " work"; # No String.new() needed!
    printf("lit1 after << \" work\": '%s'\n", lit1.toString());
    lit1 << "!";
    printf("lit1 after << \"!\": '%s'\n", lit1.toString());
    lit1.destroy();
    printf("\n");

    # Demonstrate difference: + creates new, << modifies in place
    printf("--- Difference: + vs << ---\n");
    local s1: String = String.new("Immutable");
    local s2: String = s1 + String.new(" copy");
    printf("s1 after s2 = s1 + ' copy': '%s' (unchanged)\n", s1.toString());
    printf("s2: '%s' (new string)\n", s2.toString());

    local s3: String = String.new("Mutable");
    s3 << String.new(" modified");
    printf("s3 after s3 << ' modified': '%s' (changed in place)\n", s3.toString());
    printf("\n");

    s2.destroy();
    s3.destroy();
    s1.destroy();

    # Test string equality with ==
    printf("--- String Equality (==) ---\n");
    local eq1: String = String.new("test");
    local eq2: String = String.new("test");
    local eq3: String = String.new("other");

    if (eq1 == eq2) {
        printf("'%s' == '%s': true\n", eq1.toString(), eq2.toString());
    } else {
        printf("'%s' == '%s': false\n", eq1.toString(), eq2.toString());
    }

    if (eq1 == eq3) {
        printf("'%s' == '%s': true\n", eq1.toString(), eq3.toString());
    } else {
        printf("'%s' == '%s': false\n", eq1.toString(), eq3.toString());
    }
    printf("\n");

    # Test string inequality with !=
    printf("--- String Inequality (!=) ---\n");
    if (eq1 != eq3) {
        printf("'%s' != '%s': true\n", eq1.toString(), eq3.toString());
    } else {
        printf("'%s' != '%s': false\n", eq1.toString(), eq3.toString());
    }

    if (eq1 != eq2) {
        printf("'%s' != '%s': true\n", eq1.toString(), eq2.toString());
    } else {
        printf("'%s' != '%s': false\n", eq1.toString(), eq2.toString());
    }

    eq1.destroy();
    eq2.destroy();
    eq3.destroy();

    printf("\n");

    # Test string comparison with <, >, <=, >=
    printf("--- String Comparison (<, >, <=, >=) ---\n");
    local apple: String = String.new("apple");
    local banana: String = String.new("banana");

    if (apple < banana) {
        printf("'%s' < '%s': true\n", apple.toString(), banana.toString());
    } else {
        printf("'%s' < '%s': false\n", apple.toString(), banana.toString());
    }

    if (banana > apple) {
        printf("'%s' > '%s': true\n", banana.toString(), apple.toString());
    } else {
        printf("'%s' > '%s': false\n", banana.toString(), apple.toString());
    }

    if (apple <= banana) {
        printf("'%s' <= '%s': true\n", apple.toString(), banana.toString());
    } else {
        printf("'%s' <= '%s': false\n", apple.toString(), banana.toString());
    }

    if (banana >= apple) {
        printf("'%s' >= '%s': true\n", banana.toString(), apple.toString());
    } else {
        printf("'%s' >= '%s': false\n", banana.toString(), apple.toString());
    }
    printf("\n");

    # Test lexicographic ordering
    printf("--- Lexicographic Ordering ---\n");
    local a: String = String.new("a");
    local z: String = String.new("z");
    local aa: String = String.new("aa");

    if (a < z) {
        printf("'%s' < '%s': true\n", a.toString(), z.toString());
    }
    if (a < aa) {
        printf("'%s' < '%s': true\n", a.toString(), aa.toString());
    }
    if (z > aa) {
        printf("'%s' > '%s': true\n", z.toString(), aa.toString());
    }
    # Cleanup
    hello.destroy();
    world.destroy();
    first.destroy();
    space.destroy();
    second.destroy();
    third.destroy();
    builder.destroy();
    apple.destroy();
    banana.destroy();
    a.destroy();
    z.destroy();
    aa.destroy();

    printf("\n=== All String Operator Tests Complete ===\n");
    return 0;
}

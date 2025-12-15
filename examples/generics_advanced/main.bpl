extern printf(fmt: string, ...);
# Basic types
struct Pair<K, V> {
    key: K,
    value: V,
}
frame make_pair<K, V>(k: K, v: V) ret Pair<K, V> {
    local p: Pair<K, V>;
    p.key = k;
    p.value = v;
    return p;
}
# Struct methods on generic struct (Standalone style)
frame Pair_swap<K, V>(p: Pair<K, V>) ret Pair<V, K> {
    local newP: Pair<V, K>;
    newP.key = p.value;
    newP.value = p.key;
    return newP;
}
# Generic Struct with Generic Method
struct Container<T> {
    value: T,
}
# Methods inside generic struct
struct Box<T> {
    val: T,
    # Method that uses struct's generic param
    frame getVal(this: Box<T>) ret T {
        return this.val;
    }
    # Method that introduces new generic param (generic method in generic struct)
    # This tests the contextMap + method generic args logic
    frame map<U>(this: Box<T>, defaultVal: U) ret U {
        # Determine if we should return defaultVal.
        # For test, just return it. 
        # Ideally we would cast T to U if possible or do something useful.
        return defaultVal;
    }
    # Method taking another generic struct
    frame compare(this: Box<T>, other: Box<T>) ret bool {
        # Mock comparison, return 1
        return this.val == other.val;
    }
}
# Generic Inheritance
struct Parent<S> {
    s_val: S,
}
struct Child<T> : Parent<T> {
    t_val: T,
}
frame main() ret int {
    # Test 1: Multiple Generics
    local p1: Pair<int, double>;
    p1 = make_pair<int, double>(10, 3.14);
    printf("Pair<int, double>: %d, %.2f\n", p1.key, p1.value);
    local p2: Pair<double, int>;
    p2 = Pair_swap<int, double>(p1);
    printf("Swapped Pair<double, int>: %.2f, %d\n", p2.key, p2.value);
    # Test 2: Methods on Generic Struct
    local b: Box<int>;
    b.val = 42;
    local val: int;
    val = b.getVal();
    printf("Box<int>.getVal(): %d\n", val);
    # Test 3: Generic Method on Generic Struct
    local mapped: double;
    mapped = b.map<double>(1.23);
    printf("Box<int>.map<double>: %.2f\n", mapped);
    local b2: Box<int>;
    b2.val = 42;
    local cmp: bool;
    cmp = b.compare(b2);
    printf("Box<int>.compare(Box<int>): %d\n", cmp);
    # Test 4: Generic Inheritance
    local c: Child<int>;
    c.s_val = 100;
    # access parent field
    c.t_val = 200;
    printf("Child<int> : Parent<int>: parent=%d, child=%d\n", c.s_val, c.t_val);
    # Test 5: Generic Inheritance with different types
    local c_float: Child<double>;
    c_float.s_val = 1.1;
    c_float.t_val = 2.2;
    printf("Child<double>: %.1f, %.1f\n", c_float.s_val, c_float.t_val);
    return 0;
}

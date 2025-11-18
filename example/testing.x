frame precedence_test(input: i32) ret i32 {
    local const MASK_A: i32 = 0xaa;
    local const MASK_B: i32 = 0x55;

    # Test 1: Unary, Multiplication, Addition, Bitwise AND
    # Should parse as: (~MASK_A) + ((input * 2) & MASK_B)
    local result1: i32 = ~MASK_A + input * 2 & MASK_B;

    # Test 2: Shift, Comparison, Logical OR
    # Should parse as: (input >> 10) || (input < 5)
    # NOTE: This relies on your custom rule that input < 5 yields a bool.
    # The result of || is a bool (1 or 0), which is fine for i32 assignment.
    local result2: i32 = input >> 10 || input < 5;

    # Test 3: Compound Assignment (Lowest Precedence)
    # Should parse as: result1 = result1 + (result2 * 3)
    result1 += result2 * 3;
    
    return result1;
}

global g_counter: u32 = 0;

frame scope_test() ret u32 {
    # Outer Scope: local x at RBP - 4
    local x: u32 = 10;
    
    # # Inner Scope 1: Shadowing (local x at RBP - 8, separate from the first x)
    # {
    #     local x: u32 = 20; # Hides the outer x
    #     local y: u32 = x + 5; # Uses the inner x (20)
    #     
    #     # Ensure global is accessible
    #     g_counter = g_counter + y; 
    # } # Inner x and y are popped from the stack here (RSP adjusted)
    # 
    # # Inner Scope 2: No Shadowing
    # {
    #     # Outer x (10) is still accessible
    #     x = x + 1; # Outer x is now 11
    # }

    return x; # Returns 11
}

struct Vec3 {
    x: u32,
    y: u32,
    z: u32
}

frame pointer_test(p_v: *Vec3, index: u32) ret u32 {
    # Create a static array of two Vec3 structs on the stack
    local array: Vec3[];

    # 1. Array Element Access (requires correct pointer arithmetic)
    # Transpiler should calculate: &array + (index * sizeof(Vec3))
    local element_ptr: *Vec3 = &array + index;

    # 2. Member Access with Auto-Dereference
    # The transpiler must recognize that element_ptr is *Vec3
    # and correctly calculate [element_ptr + offset_of_x]
    element_ptr.x = 99;

    # 3. Pointer Arithmetic in Assignment
    # Should calculate: p_v + 1 (adds sizeof(Vec3) bytes)
    p_v = p_v + 1;

    # 4. Return Value Combination (Dereference + Member Access)
    # Returns the value of the x field from the newly advanced pointer.
    # Should parse as: *(p_v).x
    return p_v.x;
}

frame control_test(a: i32, b: i32) ret i32 {
    local result: i32 = 0;

    # Test 1: Condition with Arithmetic (no parentheses needed)
    if a * 2 < b + 1 {
        # Test 2: Nested Ternary (Right-to-Left Associativity)
        # Should parse as: result = 1 ? 5 : 10
        # (If the result was a comparison, it would be R-to-L)
        result = a < 0 ? 10 : 20;

        if a == 0 {
            result = 1;
        } else {
            result = 2;
        }
    } else {
        # Test 3: Standard Ternary Assignment
        # Should parse as: result = (a > b) ? a : b
        result = a > b ? a : b;
    }

    # Test 4: Looping with Break and Complex Pointer Check
    local p: *i32 = call alloc(100);
    local counter: i32 = 0;

    loop {
        # Condition: (counter < 10) && (*p != 50)
        if counter < 10 && *p != 50 {
            counter = counter + 1;
            p = p + 1; # Pointer arithmetic
        } else {
            break;
        }
    }

    call free(p);
    return result;
}

a.b[c+d].e.f[g-h].i[j+k];
a && b || c || d && e && f || g && h && i || j && k;
a + b * c - d / e & f | g ^ ~h << 2 >> 1;

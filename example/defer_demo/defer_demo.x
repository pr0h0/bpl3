#==============================================================================
# Defer Statement Demo
#==============================================================================
#
# This example demonstrates the 'defer' statement in BPL, which schedules
# code to run when the current function exits.
#
# KEY CONCEPTS:
#
# 1. LIFO Execution Order
#    Deferred statements execute in Last-In-First-Out order.
#    If you have: defer A; defer B; defer C;
#    They execute as: C, B, A (reverse order)
#
# 2. Guaranteed Cleanup
#    Deferred code runs regardless of how the function exits:
#    - Normal return
#    - Early return
#    - End of void function
#
# 3. Resource Management
#    Perfect for cleanup tasks like:
#    - Closing files
#    - Freeing memory
#    - Releasing locks
#    - Logging function exit
#
# SYNTAX:
#    defer { <statements> }
#
# The deferred block must use curly braces.
#
#==============================================================================

import printf, malloc, free from "std/libc.x";

#------------------------------------------------------------------------------
# Example 1: Basic defer - LIFO order demonstration
#------------------------------------------------------------------------------
frame demo_lifo_order() {
    call printf("\n=== Example 1: LIFO Order ===\n");
    call printf("Registering defers...\n");

    defer {
        call printf("  [Defer 1] First registered, last to run\n");
    }

    defer {
        call printf("  [Defer 2] Second registered\n");
    }

    defer {
        call printf("  [Defer 3] Third registered, first to run\n");
    }

    call printf("Function body executing...\n");
    call printf("About to exit function...\n");
    # Defers will run here in reverse order: 3, 2, 1
}

#------------------------------------------------------------------------------
# Example 2: Defer with return value
#------------------------------------------------------------------------------
frame demo_return_value() ret u64 {
    call printf("\n=== Example 2: Defer with Return Value ===\n");

    defer {
        call printf("  Cleanup runs AFTER return value is computed\n");
    }

    call printf("Computing return value...\n");
    local result: u64 = 42;

    call printf("Returning %d...\n", result);
    return result;
    # Defer runs here, then function actually returns
}

#------------------------------------------------------------------------------
# Example 3: Memory management with defer
#------------------------------------------------------------------------------
frame demo_memory_management() {
    call printf("\n=== Example 3: Memory Management ===\n");

    # Allocate memory
    local buffer: *u8 = call malloc(1024);
    call printf("Allocated 1024 bytes at %p\n", buffer);

    # Schedule cleanup immediately after allocation
    # This ensures memory is freed even if we return early
    defer {
        call printf("  Freeing buffer at %p\n", buffer);
        call free(buffer);
    }

    # Use the buffer...
    call printf("Using buffer...\n");

    # Memory will be freed automatically when function exits
    call printf("Function complete, defer will free memory\n");
}

#------------------------------------------------------------------------------
# Example 4: Multiple resources with proper cleanup order
#------------------------------------------------------------------------------
frame demo_multiple_resources() {
    call printf("\n=== Example 4: Multiple Resources ===\n");

    # Resource 1
    local res1: *u8 = call malloc(100);
    call printf("Acquired resource 1 at %p\n", res1);
    defer {
        call printf("  Releasing resource 1\n");
        call free(res1);
    }

    # Resource 2
    local res2: *u8 = call malloc(200);
    call printf("Acquired resource 2 at %p\n", res2);
    defer {
        call printf("  Releasing resource 2\n");
        call free(res2);
    }

    # Resource 3
    local res3: *u8 = call malloc(300);
    call printf("Acquired resource 3 at %p\n", res3);
    defer {
        call printf("  Releasing resource 3\n");
        call free(res3);
    }

    call printf("All resources acquired, using them...\n");
    call printf("Function ending, resources released in reverse order:\n");
    # Resources freed: res3, res2, res1 (reverse of acquisition)
}

#------------------------------------------------------------------------------
# Example 5: Defer with early return
#------------------------------------------------------------------------------
frame demo_early_return(should_exit_early: u8) ret u64 {
    call printf("\n=== Example 5: Early Return (exit_early=%d) ===\n", should_exit_early);

    defer {
        call printf("  Cleanup always runs!\n");
    }

    if should_exit_early != 0 {
        call printf("Taking early exit path...\n");
        return 0;
        # Defer runs before this return
    }

    call printf("Taking normal path...\n");
    return 1;
    # Defer runs before this return too
}

#------------------------------------------------------------------------------
# Example 6: Nested functions with defer
#------------------------------------------------------------------------------
frame inner_function() {
    call printf("    Inner function started\n");
    defer {
        call printf("    Inner function cleanup\n");
    }
    call printf("    Inner function body\n");
}

frame demo_nested_functions() {
    call printf("\n=== Example 6: Nested Functions ===\n");

    defer {
        call printf("  Outer function cleanup\n");
    }

    call printf("  Outer function body - calling inner\n");
    call inner_function();
    call printf("  Back in outer function\n");
}

#------------------------------------------------------------------------------
# Example 7: Defer in a loop (defer is per-function, not per-iteration!)
#------------------------------------------------------------------------------
frame demo_defer_with_loop() {
    call printf("\n=== Example 7: Defer with Loop ===\n");
    call printf("Note: defer is registered once per function call,\n");
    call printf("      not once per loop iteration!\n\n");

    # This defer runs once when the function exits
    defer {
        call printf("  Function cleanup (runs once at end)\n");
    }

    local i: u64 = 0;
    loop {
        if i >= 3 {
            break;
        }
        call printf("Loop iteration %d\n", i);
        i = i + 1;
    }

    call printf("Loop complete, function ending...\n");
}

#------------------------------------------------------------------------------
# Main function - run all demos
#------------------------------------------------------------------------------
frame main() ret i32 {
    call printf("========================================\n");
    call printf("   BPL Defer Statement Demonstration\n");
    call printf("========================================\n");

    # Run all examples
    call demo_lifo_order();

    local result: u64 = call demo_return_value();
    call printf("  Received return value: %d\n", result);

    call demo_memory_management();
    call demo_multiple_resources();

    call demo_early_return(1);  # Early exit
    call demo_early_return(0);  # Normal exit

    call demo_nested_functions();
    call demo_defer_with_loop();

    call printf("\n========================================\n");
    call printf("   All demos completed successfully!\n");
    call printf("========================================\n");

    return 0;
}

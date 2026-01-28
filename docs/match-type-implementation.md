# match<Type> Extension Implementation Summary

## Overview

Extended the `match<Type>(value)` syntax to support both enum variant checking and (future) generic type checking.

## Current Implementation

### Enum Variant Matching (✅ COMPLETE)

The `match<Type>(value)` syntax works perfectly for checking enum variants at runtime:

```bpl
enum Option<T> {
    Some(T),
    None,
}

frame checkOption(opt: Option<int>) ret int {
    if (match<Option.Some>(opt)) {
        printf("Found Some variant\n");
        return 1;
    }
    if (match<Option.None>(opt)) {
        printf("Found None variant\n");
        return 0;
    }
    return -1;
}
```

**How it works:**

- Syntax: `match<EnumName.VariantName>(value)`
- Returns: `bool` (true if value is that variant, false otherwise)
- Implementation: Extracts discriminant tag and compares with variant index
- Supports: Generic enums with instantiation (e.g., `Option<int>.Some`)
- Use cases: Early returns, conditional logic, validation

### Type Matching for Non-Enum Types (⚠️ PARTIALLY IMPLEMENTED)

The infrastructure is in place for `match<Type>(value)` with non-enum types, but **requires Runtime Type Information (RTTI)** to be fully functional.

**What exists:**

```typescript
// In CodeGenerator.ts
private generateRegularTypeMatch(
    matchValue: string,
    valueType: AST.TypeNode,
    targetType: AST.BasicTypeNode,
    expr: AST.TypeMatchExpr
): string {
    // For regular type matching, compare the runtime types
    // This is useful in generic contexts like: match<int>(arg) where arg: T

    const valueTypeStr = this.resolveType(valueType);
    const targetTypeStr = this.resolveType(targetType);

    // For simple cases where we can determine at compile time
    if (valueTypeStr === targetTypeStr) {
        // Types match at compile time - always true
        // ... generates: icmp eq i1 1, 1
    }

    // For generic type parameters, needs RTTI
    // Currently does size-based heuristic matching
}
```

**What's needed for full generic type checking:**

1. **Runtime Type Information (RTTI) System**
   - Assign unique type IDs to each type
   - Store type ID with generic parameters
   - Generate type ID comparison code

2. **Type Metadata**
   - Size, alignment, structure
   - Type hierarchy for inheritance
   - Conversion rules

3. **Generic Context Tracking**
   - Track actual type of generic parameters
   - Propagate type information through function calls
   - Generate type-specific code paths

### Example Use Case (Future)

```bpl
# This is the goal - checking actual type in generic context
frame processValue<T>(arg: T) ret int {
    if (match<int>(arg)) {
        # arg is actually an int
        return arg * 2;
    }
    if (match<string>(arg)) {
        # arg is actually a string
        printf("String: %s\n", arg);
        return 0;
    }
    return -1;
}

frame main() ret int {
    processValue<int>(42);        # Calls int path
    processValue<string>("hello"); # Calls string path
    return 0;
}
```

## Implementation Details

### CodeGenerator Changes

**File:** `compiler/backend/CodeGenerator.ts`

1. **Main entry point:**

   ```typescript
   private generateTypeMatch(expr: AST.TypeMatchExpr): string {
       // Dispatches to either enum variant or regular type matching
       if (fullTypeName.includes(".")) {
           return this.generateEnumVariantTypeMatch(...);
       } else {
           return this.generateRegularTypeMatch(...);
       }
   }
   ```

2. **Enum variant matching:**

   ```typescript
   private generateEnumVariantTypeMatch(...): string {
       // Extract enum name and variant name
       // Resolve generic instantiation if needed
       // Get variant index from enum metadata
       // Generate LLVM code to:
       //   1. Allocate space for enum value
       //   2. Extract discriminant tag
       //   3. Compare tag with variant index (icmp eq)
   }
   ```

3. **Regular type matching (partial):**

   ```typescript
   private generateRegularTypeMatch(...): string {
       // Compile-time known types: compare type strings
       // Generic type parameters: size-based heuristic
       // Future: RTTI-based runtime comparison
   }
   ```

4. **Helper methods:**
   - `isGenericTypeParameter(name: string)`: Heuristic check
   - `isPrimitiveType(name: string)`: Known primitive list
   - `getASTTypeSize(type: AST.TypeNode)`: Size calculation

### TypeChecker Changes

**File:** `compiler/middleend/TypeChecker.ts`

Enhanced `checkTypeMatch` method:

```typescript
private checkTypeMatch(expr: AST.TypeMatchExpr): AST.TypeNode {
    // 1. Validate value expression
    // 2. Extract target type name

    if (targetTypeName.includes(".")) {
        // Enum variant pattern
        // Extract base enum name (handle generics)
        // Verify enum exists in scope
        // Variant validation deferred to CodeGenerator
    } else {
        // Regular type
        // Check if type is known primitive or defined in scope
        // Note: Full RTTI validation deferred
    }

    return { kind: "BasicType", name: "bool", ... };
}
```

**Key improvements:**

- Handles generic enum names (e.g., `Option<int>.Some` → base name `Option`)
- Validates enum exists in scope
- Validates non-enum types are defined or primitive
- Provides helpful error messages

## Testing

### Test Coverage

**File:** `tests/Enum.test.ts`

- Total enum tests: 93 (all passing)
- Type matching tests: 7
- Pattern guards tests: 7
- Combined tests: 2

### Example Tests

**Directory:** `examples/`

1. `enum_type_match/` - Basic variant checking
2. `enum_typematch_comprehensive/` - Advanced patterns
3. `match_type_generics/` - Multiple enum types
4. `match_type_future/` - Documented future capabilities

## Current Limitations

1. **No RTTI for Generic Type Checking**
   - `match<int>(genericArg)` in generic functions doesn't work yet
   - Compile-time type comparison only
   - Size-based heuristics for some cases

2. **No Support for:**
   - Struct type checking
   - Interface/trait type checking
   - Pointer type discrimination
   - Array type checking

3. **Heuristics Used:**
   - Generic type parameter detection (uppercase, short names)
   - Size-based type matching (unreliable)
   - Compile-time type resolution preferred

## Next Steps for Full Implementation

### Phase 1: RTTI Foundation

1. Design type ID system
   - Assign unique integers to each type
   - Generate type registry
   - Include in compiled output

2. Modify code generation
   - Emit type IDs for all types
   - Store type ID with values (hidden field or metadata)
   - Generate type ID comparison code

### Phase 2: Generic Context

1. Track generic instantiation
   - Pass type IDs as hidden parameters
   - Store in frame/context structure
   - Propagate through call chain

2. Generate specialized code
   - Create type-specific branches
   - Optimize based on known types
   - Support runtime dispatch

### Phase 3: Advanced Features

1. Struct and interface types
2. Pointer and reference types
3. Array and tuple types
4. Type conversion checking

## Compatibility

- ✅ Backward compatible with existing enum code
- ✅ All existing tests pass
- ✅ Pattern guards work with type matching
- ✅ Generic enums fully supported
- ⚠️ New non-enum type matching syntax compiles but has limited functionality

## Performance

### Enum Variant Matching

- **Cost:** One memory allocation + one load + one comparison
- **LLVM IR:** ~5-7 instructions
- **Optimization:** LLVM can inline and optimize away allocations

### Future Generic Type Checking

- **Cost:** Type ID comparison (likely 1-2 instructions)
- **Storage:** +4 or +8 bytes per generic value for type ID
- **Optimization:** Type IDs can be compile-time constants in many cases

## Conclusion

The `match<Type>` feature is fully implemented and working for **enum variant checking**, which was the primary goal. The infrastructure for **generic type checking** is in place, but requires a **Runtime Type Information (RTTI) system** to be fully functional. This is a significant engineering effort that would be valuable for future language features like:

- Dynamic dispatch
- Type introspection
- Generic constraints
- Reflection APIs
- Debugging support

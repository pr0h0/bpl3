# TypeKind constants
global const TYPE_KIND_PRIMITIVE: u8 = 0;
export {TYPE_KIND_PRIMITIVE};

global const TYPE_KIND_STRUCT: u8 = 1;
export {TYPE_KIND_STRUCT};

global const TYPE_KIND_ARRAY: u8 = 2;
export {TYPE_KIND_ARRAY};

global const TYPE_KIND_POINTER: u8 = 3;
export {TYPE_KIND_POINTER};

global const TYPE_KIND_ENUM: u8 = 4;
export {TYPE_KIND_ENUM};

global const TYPE_KIND_FUNCTION: u8 = 5;
export {TYPE_KIND_FUNCTION};

export [FieldInfo];
struct FieldInfo {
    name: string,
    offset: ulong,
    type_info: *TypeInfo,
}

export [MethodInfo];
struct MethodInfo {
    name: string,
    # Pointer to the function.
    # We use *void here, but it will be cast to the correct function pointer type at runtime.
    # For toJson, we expect Func<string>(*T).
    func_ptr: *void,
}

export [TypeInfo];
struct TypeInfo {
    name: string,
    size: ulong,
    kind: u8,

    # For Structs
    num_fields: int,
    fields: *FieldInfo,
    num_methods: int,
    methods: *MethodInfo,

    # For Arrays/Pointers
    element_type: *TypeInfo,
}

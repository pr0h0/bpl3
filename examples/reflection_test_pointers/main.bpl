import [TypeInfo], [FieldInfo], [MethodInfo] from "std/reflection.bpl";

extern printf(fmt: string, ...) ret int;
extern strcmp(s1: string, s2: string) ret int;

struct MyData {
    value: int,

    frame increment(this: *MyData) {
        this.value = this.value + 1;
    }
}

frame main() ret int {
    local data: MyData;
    data.value = 42;

    local info: *TypeInfo = typeof<MyData>();

    # 1. Get Field Pointer
    local i: int = 0;
    loop (i < info.num_fields) {
        local f: FieldInfo = info.fields[i];
        if (strcmp(f.name, "value") == 0) {
            printf("Field '%s' offset: %lu\n", f.name, f.offset);

            # Calculate pointer to field
            local basePtr: ulong = cast<ulong>(&data);
            local fieldPtr: ulong = basePtr + f.offset;
            local valuePtr: *int = cast<*int>(fieldPtr);

            printf("Value via reflection: %d\n", *valuePtr);
        }
        i = i + 1;
    }

    # 2. Get Method Pointer
    i = 0;
    loop (i < info.num_methods) {
        local m: MethodInfo = info.methods[i];
        if (strcmp(m.name, "increment") == 0) {
            printf("Calling method '%s' via reflection...\n", m.name);

            # Cast void* to function pointer
            # Signature: frame(this: *MyData) ret void
            local func: Func<void>(*MyData) = cast<Func<void>(*MyData)>(m.func_ptr);

            # Call it
            func(&data);
        }
        i = i + 1;
    }

    printf("New value: %d\n", data.value);

    return 0;
}

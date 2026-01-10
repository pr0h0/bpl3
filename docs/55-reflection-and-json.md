# Reflection and Generic JSON

BPL now supports **Runtime Type Information (RTTI)** and **Reflection**, enabling powerful generic libraries like JSON serialization without boilerplate code.

## Reflection Basics

The `typeof<T>()` operator returns a pointer to `TypeInfo`, which describes a type at runtime.

### TypeInfo Structure

The core of the reflection system is the `TypeInfo` struct (defined in `std/reflection.bpl`):

```bpl
struct TypeInfo {
    name: string,       # Type name (e.g., "int", "Point", "Array<int>")
    size: ulong,        # Size in bytes
    kind: u8,           # 0=Prim, 1=Struct, 2=Array, 3=Pointer, 4=Enum, 5=Func

    # For Structs
    num_fields: int,
    fields: *FieldInfo,
    num_methods: int,
    methods: *MethodInfo,

    # For Arrays/Pointers
    element_type: *TypeInfo
}

struct FieldInfo {
    name: string,
    offset: ulong,
    type_info: *TypeInfo
}

struct MethodInfo {
    name: string,
    func_ptr: *void
}
```

### Usage Example

```bpl
import [TypeInfo], {TYPE_KIND_STRUCT} from "std/reflection.bpl";

struct Point { x: int, y: int }

frame main() {
    local info: *TypeInfo = typeof<Point>();
    printf("Type: %s, Size: %d\n", info.name, info.size);

    if (info.kind == TYPE_KIND_STRUCT) {
        printf("Fields: %d\n", info.num_fields);
    }
}
```

## Generic JSON Library

The generic JSON library (`std/json.bpl`) uses reflection to automatically serialize and parse structs, arrays, and primitives.

### Serialization

Use `JSON.stringify<T>(obj: *T)` to convert any object to a JSON string.

```bpl
import [JSON] from "std/json.bpl";

struct User {
    id: int,
    name: string,
    active: bool
}

frame main() {
    local u: User;
    u.id = 1;
    u.name = "Alice";
    u.active = true;

    local json: String = JSON.stringify<User>(&u);
    IO.log(json.toString());
    # Output: {"id":1,"name":"Alice","active":true}
}
```

### Parsing

Use `JSON.parse<T>(json: string)` to parse a JSON string into a new object.

```bpl
frame main() {
    local json: string = "{\"id\":2,\"name\":\"Bob\",\"active\":false}";
    local uPtr: *User = JSON.parse<User>(json);

    printf("User: %s\n", uPtr.name);
    free(cast<string>(uPtr)); # Clean up if necessary
}
```

### Custom Serialization (`toJson`)

You can customize how a struct is serialized by implementing a `toJson` method. The generic serializer checks for this method via reflection.

```bpl
struct Date {
    timestamp: long,

    frame toJson(this: *Date) ret string {
        # Custom logic to format date
        local sb: StringBuilder = StringBuilder.new();
        sb.append("\"");
        sb.append(generic_format_date(this.timestamp));
        sb.append("\"");
        return sb.toString(); # Note: return raw JSON string
    }
}
```

### Supported Types

- **Primitives**: `int`, `float`, `bool`, `string`, `char`, `long`, `ushort`, `uint`, `ulong`.
- **Structs**: Automatically serializes all fields.
- **Arrays**: `Array<T>` is supported dynamically.
- **Pointers**: `*T` is serialized as the value it points to (or `null` if nullptr).
- **Enums**: (Partial support) Serialized as variant name or object depending on implementation.

## Performance Considerations

Reflection in BPL is zero-overhead at compile time for generating the metadata, but runtime usage involves pointer chasing. `typeof<T>()` returns a constant pointer resolved at compile-time/link-time.

The JSON library uses generic recursion, which is efficient but slower than specialized hand-written serialization code. For extreme performance-critical paths, consider implementing custom serialization methods.

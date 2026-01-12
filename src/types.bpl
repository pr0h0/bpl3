export [TypeKind];
export [Type];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";

enum TypeKind {
    Void,
    Int,
    Float,
    Bool,
    Char,
    Pointer,
    Array,
    Struct,
    Function,
    Tuple,
    Enum,
}

struct Type {
    kind: TypeKind,
    name: String,
    size: int,
    align: int,

    # For Pointer/Array
    base: *Type,

    # For Struct/Enum
    # We might reference the AST Symbol
    symbol: *void,

    frame isInteger(this: *Type) ret bool {
        return this.kind == TypeKind.Int; # Simplification
    }
}

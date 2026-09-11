# Introduction to BPL

BPL (Best Programming Language) is a statically typed language whose compiler
emits LLVM IR and uses Clang to produce native code. The compiler is written in
TypeScript and runs on Bun. BPL is under active development; see the
[bug log](../BUGS.md) for known limitations.

## Language features

- Functions use `frame`; variables use `local` or `global` with explicit types.
- Structs support methods and single inheritance. Generics specialize for the
  concrete types supplied at call sites.
- Enums carry optional payloads. `match` supports destructuring and guards.
- `try`, `catch`, `throw`, and `defer` support error handling and scoped cleanup.
- Closures use `Lambda<Ret>(Args)`; raw function pointers use `Func<Ret>(Args)`.
- Backtick interpolation constructs an owned standard-library `String`.
- `import` and `export` organize modules; `extern` declares foreign functions.
- Pointers, casts, and inline assembly provide low-level access.

These features have costs that depend on the code: collections and interpolation
allocate, closures may allocate capture storage, virtual calls use vtables, and
checked operations execute runtime tests. LLVM can optimize generated code;
there is no blanket zero-overhead or performance guarantee.

## Memory and safety

BPL has no garbage collector or borrow checker. Raw pointers can dangle, alias,
or point outside an allocation. Ownership remains the programmer's responsibility;
copying an owning struct does not clone its allocation. Follow each library's
cleanup contract, using `destroy()`, `free`, or `defer` as appropriate.

The compiler checks types and emits checks for selected operations, including
null member access, checked array indexing, and integer division failures. These
checks do not make arbitrary pointer arithmetic, foreign code, or assembly memory
safe. See [pointers](15-pointers.md), [arrays](16-arrays.md), and
[runtime support](66-runtime-library.md) for the relevant boundaries.

Local types are explicit. Some conversions, such as numeric widening and pointer
upcasts, are implicit; use `cast<T>(value)` for explicit conversions. `Option<T>`
is a library enum, not a built-in ownership or nullability system.

## Example

```bpl
import [Math] from "std/math.bpl";
import [String] from "std/string.bpl";
import printf from "std/c.bpl";

struct Point {
    x: int,
    y: int,
    frame distance(this: *Point) ret float {
        return Math.sqrt(cast<float>(this.x * this.x + this.y * this.y));
    }
}

frame main() ret int {
    local p: Point = Point { x: 3, y: 4 };
    printf("Distance: %f\n", p.distance());
    local message: String = `Point is at (${p.x}, ${p.y})`;
    printf("%s\n", message.toString());
    message.destroy();
    return 0;
}
```

This prints `Distance: 5.000000` followed by `Point is at (3, 4)`.

## Tools and platform scope

The CLI includes compilation, running, formatting, diagnostics, package management,
and watch commands. A VS Code extension provides language tooling. Start with
[installation](02-installation.md) and the [quick start](03-quick-start.md).

Native runtime builds support Linux and macOS. Windows has compiler-component
checks in CI; use WSL for the documented native build workflow. A target triple
alone does not supply foreign system libraries or a linker. See
[cross-compilation](37-cross-compilation.md) and
[WebAssembly](39-compiler-options.md#webassembly-output) for target-specific requirements.

The [standard library guide](48-stdlib-api.md) explains selected APIs
and limitations; the [generated declaration reference](stdlib-reference.md)
lists declarations from every module. Some modules remain experimental or stubs.

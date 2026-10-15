# bpl-templ

**bpl-templ** is a simple, compiled template engine for the Best Programming Language (BPL). It compiles `.bte` (BPL Template) files into type-safe BPL structs.

## Features

- **Compiled**: Templates are compiled directly into BPL code, ensuring zero parsing overhead at runtime.
- **Type Safe**: Arguments are typed in the template header.
- **Automatic Escaping**: Output is HTML-escaped by default to prevent XSS.
- **Components**: Templates compile to structs, allowing easy composition via method calls.

## Installation

This package provides a CLI tool for compiling templates.

```bash
cd packages/bpl-templ
bun install
bun run build
# The binary is now at src/bpl-templ
```

## Usage

### CLI

To compile a directory of templates:

```bash
bpl_modules/.bin/bpl-templ generate ./src/views -o ./src/views
```

When working from this repository without installing the package first, run the
source CLI directly:

```bash
bpl run packages/bpl-templ/src/cli.bpl generate ./src/views -o ./src/views
```

Arguments:

- `<input_dir>`: Directory containing `.bte` files.
- `-o <output_dir>`: Destination for generated `.bpl` files.
- `--ext <extension>`: output extension (default `.bpl`).

### Template Syntax (`.bte`)

#### 1. Header Directives

Templates may start with header directives to define arguments and imports.
Without an `@args` directive, the component has no arguments.

- **`@args <signature>`**: Defines the arguments for the generated `render` function.
- **`@import <module>`**: Imports external BPL modules (e.g., structs used in args).

```html
@import [User] from "../models.bpl"
@args user: *User, title: string
```

#### 2. Interpolation

- **Escaped Output**: `{{ expression }}`
  - Automatically escapes HTML entities (`<`, `>`, `&`, `"`, `'`).
  - Expression must evaluate to a `string`.

  ```html
  <p>Hello, {{ user.name }}</p>
  ```

- **Raw Output**: `{{ !expression }}`
  - Outputs the string directly without escaping.
  - Useful for rendering other templates (partials).

  ```html
  {{ !Navbar.render(user) }}
  ```

#### 3. Control Flow

The compiler supports basic control flow mapping to BPL keywords. Note that `}` must be on its own line for the naive parser to detect it correctly in some cases.

- **`@if (condition) {`**
- **`@else {`** (or `@else if`)
- **`@loop (condition) {`**

```html
@if (user.is_admin) {
<button>Delete</button>
} @else {
<span>Read only</span>
}
```

loops:

```html
@loop (i < 10) {
<li>Item {{ i }}</li>
{{ i = i + 1; "" }}
<!-- side effect hack if needed, though usually logic should be in controller -->
}
```

### Generated Code Model

A template named `home.bte` is compiled into a struct `Home`.

**Input (`home.bte`):**

```html
@args name: string
<h1>Hello {{ name }}</h1>
```

**Output (`home.bpl`):**

```bpl
import [StringBuilder] from "std/string_builder.bpl";
import HTMLEscape_appendEscaped from "bpl-templ";
extern free(ptr: *void);

struct Home {
    frame write(_sb: *StringBuilder, name: string) {
        _sb.append("<h1>Hello ");
        HTMLEscape_appendEscaped(_sb, name);
        _sb.append("</h1>\n");
    }

    frame render(name: string) ret string {
        local sb: StringBuilder = StringBuilder.new(1024);
        Home.write(&sb, name);
        return sb.toString();
    }

    frame free(str: string) {
        if (str != nullptr) {
            free(cast<*void>(str));
        }
    }
}
export [Home];
```

## Runtime Dependencies

The generated code relies on:

1. `std/string_builder.bpl` (Standard Library)
2. `bpl-templ` runtime (for `HTMLEscape_appendEscaped`)

Ensure your project links against these.

## Example

See `examples/tiki/src/views` for a full usage example in a real application.

## Ownership and composition

`Component.render(...)` returns an owned NUL-terminated buffer. Call
`Component.free(html)` after sending or otherwise consuming it. For repeated
rendering, use `Component.write(&builder, ...)` with a shared StringBuilder;
its caller owns and destroys the builder. Zero-argument templates are supported.

Use `@call Navbar.write(_sb, user)` for allocation-free component composition
(add the component import in the header). Raw `{{ !expression }}` appends the
expression verbatim and does not rewrite method calls; manage any returned
allocations yourself. HTML escaping is for HTML text and quoted attributes,
not JavaScript, CSS, or URL validation. Raw output must come from trusted markup.
Unclosed or empty interpolations raise a compilation error. Template files are
trusted source code: directives and expressions can invoke BPL functions.

Generator arguments are validated before traversal: unknown options, extra input
directories and missing/empty option values return status 1 without generating
files. Input directory, read and output-write failures also return status 1. Output paths
starting with a dash can be written with a `./` prefix.

Only the final `.bte` suffix is removed when deriving a component name or replaced
when choosing an output extension. For example, `part.bte.name.bte` generates
`part.bte.name.bpl` with component `PartBteName`.

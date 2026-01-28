# bpl-templ

**bpl-templ** is a simple, compiled template engine for the Basic Programming Language (BPL). It compiles `.bte` (BPL Template) files into type-safe BPL structs.

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
# The binary is now at dist/bpl-templ
```

## Usage

### CLI

To compile a directory of templates:

```bash
bpl run packages/bpl-templ/src/cli.bpl generate ./src/views -o ./src/views
```

Arguments:

- `<input_dir>`: Directory containing `.bte` files.
- `-o <output_dir>`: Destination for generated `.bpl` files.
- `--ext <extension>`: output extension (default `.bpl`).

### Template Syntax (`.bte`)

#### 1. Header Directives

Templates **must** start with header directives to define arguments and imports.

- **`@args <signature>`**: Defines the arguments for the generated `render` function.
- **`@import <module>`**: Imports external BPL modules (e.g., structs used in args).

```html
@import [User] from "../models.bpl" @args user: *User, title: string
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
import [HTMLEscape_appendEscaped] from "bpl-templ";

struct Home {
    frame render(name: string) ret string {
        local _sb = StringBuilder.new(1024);
        _sb.append("<h1>Hello ");
        HTMLEscape_appendEscaped(&_sb, name);
        _sb.append("</h1>\n");
        return _sb.toString();
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

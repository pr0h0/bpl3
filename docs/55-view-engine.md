# View Engine (bpl-templ)

BPL provides a compiled, type-safe view engine via the `bpl-templ` package. It follows a syntax similar to Razor or other text-based template engines but transpiles directly to BPL structs.

## Overview

The view engine allows you to write `.bte` files mixing HTML (or any text) with BPL code.

- **Type Safe**: Templates declare their arguments.
- **Compiled**: Templates become native BPL structs, participating in the build process.
- **Secure**: Default HTML escaping for interpolated strings.

## Syntax

### Directives

Header directives define the template's interface.

```html
@import [User] from "../models.bpl" @args user: *User
```

### Interpolation

Use `{{ }}` to output values.

```html
<!-- Escaped (default) -->
<p>Hello, {{ user.name }}</p>

<!-- Raw (Unescaped) -->
{{ !Navbar.render(user) }}
```

### Control Flow

Native control flow structures are supported.

```html
@if (user.isLoggedIn) {
<p>Welcome back!</p>
} @else {
<a href="/login">Login</a>
} @loop (i < 5) {
<span>{{ i }}</span>
{{ i = i + 1; "" }} }
```

## Compilation

Templates are compiled using the `bpl-templ` CLI tool.

```bash
bpl run packages/bpl-templ/src/cli.bpl generate src/views -o src/views
```

This generates `.bpl` files (e.g., `src/views/MyView.bpl`) which define a struct `MyView` with a `render` method.

## Usage in Code

Since templates become structs, you use them like any other object.

```bpl
import [MyView] from "./views/MyView.bpl";

frame handleRequest(req: *Request, res: *Response) {
    local html: string = MyView.render(userData);

    # Clean up the allocated string
    defer MyView.free(html);

    res.html(html);
}
```

## More Information

For full documentation, see [packages/bpl-templ/README.md](../packages/bpl-templ/README.md).

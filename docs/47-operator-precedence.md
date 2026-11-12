# Operator Precedence

Order of operations, from tightest to loosest binding. Binary operators of one
level associate left to right; the conditional and assignment operators
associate right to left.

1. Postfix: calls `f()`, indexing `a[i]`, member access `a.b` (also through a
   pointer), postfix `x++` `x--`
2. Prefix: `!` `~` `-` `*` (dereference) `&` (address of) `++x` `--x`
3. `*` `/` `%`
4. `+` `-`
5. `<<` `>>`
6. `<` `<=` `>` `>=`
7. `is` `as` (runtime type check and checked downcast: `p is *Dog`)
8. `==` `!=`
9. `&`
10. `^`
11. `|`
12. `&&`
13. `||`
14. `condition ? a : b`
15. `=` `+=` `-=` `*=` `/=` `%=` `&=` `|=` `^=`

`cast<T>(value)`, `sizeof(...)`, `offsetof(...)` and `typeof(...)` are written
like calls and need no precedence of their own. BPL has no `->`; use `.` on a
struct pointer. There is no unary `+`.

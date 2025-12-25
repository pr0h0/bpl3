# Common Pitfalls

Mistakes to avoid.

## Pointers

- Dereferencing nullptrs.
- Using freed memory (use-after-free).
- Memory leaks (forgetting to free).
- Accessing struct fields on nullptr objects now throws `NullAccessError` at runtime (catch it if you want to recover).

## Types

- Implicit conversions can sometimes lead to precision loss.

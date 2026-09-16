# Type Aliases

Type aliases create a new name for an existing type. They are useful for simplifying complex types or adding semantic meaning.

## Syntax

```bpl
type UserID = int;
type Point = (int, int);
type Handler = Func<void>(int);
```

## Usage

```bpl
local id: UserID = 123;
local p: Point = (0, 0);
```

## Array aliases and slices

Dimensions on an alias use wrap the aliased type. With `type Row = int[2];`,
`Row[3]` is a three-row array equivalent to `int[3][2]`, and `Row[]` is a slice
whose elements are two-integer rows. Generic aliases follow the same rule.
A slice shares the original array's storage and must not outlive it.

```bpl
type Row = int[2];
type Rows<T> = T[];

frame cell(rows: Rows<Row>, i: int, j: int) ret int {
    return rows[i][j];
}

frame main() ret int {
    local grid: Row[3];
    grid[2][1] = 42;
    local view: Row[] = grid;
    view[0][0] = 7;
    if (grid[0][0] != 7) return 1;
    return cell(view, 2, 1) - 42;
}
```

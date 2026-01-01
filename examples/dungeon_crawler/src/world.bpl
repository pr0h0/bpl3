export [Grid];
export [TileType];
export [Tile];

import [Array] from "std/array.bpl";
import [IndexOutOfBoundsError] from "std/errors.bpl";

enum TileType {
    Wall,
    Floor,
    Door(bool), # true = open, false = closed
}

struct Tile {
    kind: TileType,
    visible: bool,
    seen: bool,
}

struct Grid<T> {
    width: int,
    height: int,
    cells: Array<T>,
    frame new(width: int, height: int, default_val: T) ret Grid<T> {
        local grid: Grid<T>;
        grid.width = width;
        grid.height = height;
        grid.cells = Array<T>.new(width * height);

        loop (local i: int = 0; i < (width * height); i = i + 1) {
            grid.cells.push(default_val);
        }
        return grid;
    }

    frame get(this: *Grid<T>, x: int, y: int) ret T {
        if ((x < 0) || (x >= this.width) || (y < 0) || (y >= this.height)) {
            throw IndexOutOfBoundsError { index: x, size: this.width };
        }
        return this.cells.get((y * this.width) + x);
    }

    frame set(this: *Grid<T>, x: int, y: int, val: T) {
        if ((x >= 0) && (x < this.width) && (y >= 0) && (y < this.height)) {
            this.cells.set((y * this.width) + x, val);
        }
    }

    frame destroy(this: *Grid<T>) {
        this.cells.destroy();
    }
}

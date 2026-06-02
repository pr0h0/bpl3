# Enums used with struct methods

import [printf] from "std/c.bpl";

enum Direction {
    North,
    South,
    East,
    West,
}

struct Position {
    x: int,
    y: int,
    frame move(this: Position, dir: Direction) ret Position {
        local new_x: int = this.x;
        local new_y: int = this.y;

        local dx: int = match (dir) {
            Direction.North => 0,
            Direction.South => 0,
            Direction.East => 1,
            Direction.West => -1,
        };

        local dy: int = match (dir) {
            Direction.North => 1,
            Direction.South => -1,
            Direction.East => 0,
            Direction.West => 0,
        };

        new_x = new_x + dx;
        new_y = new_y + dy;

        local result: Position = Position { x: new_x, y: new_y };
        return result;
    }
}

frame main() ret int {
    local pos: Position;
    pos.x = 5;
    pos.y = 10;

    local new_pos: Position = pos.move(Direction.East);

    # new_pos.x should be 6
    printf("New X Position: %d\n", new_pos.x);
    return new_pos.x;
}

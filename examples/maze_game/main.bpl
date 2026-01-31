# Infinite Maze Game
# Navigate through randomly generated mazes
# Reach the exit to score points and get a new maze!

import [Rand] from "std/rand.bpl";
import [Array] from "std/array.bpl";

extern printf(fmt: string, ...);
extern getchar() ret int;

# Terminal control for raw input (no Enter required)
extern tcgetattr(fd: int, termios: *void) ret int;
extern tcsetattr(fd: int, optional_actions: int, termios: *void) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void);
extern memcpy(dest: *void, src: *void, n: long) ret *void;

# termios structure offsets and flags for Linux x86_64
# struct termios { c_iflag, c_oflag, c_cflag, c_lflag, c_line, c_cc[32], c_ispeed, c_ospeed }
# Each flag is 4 bytes (unsigned int)
local const TERMIOS_SIZE: int = 60;
local const STDIN_FD: int = 0;
local const TCSANOW: int = 0;

# Offsets in termios struct (in bytes)
local const LFLAG_OFFSET: int = 12; # c_lflag is the 4th field (3 * 4 = 12)

# Local flags to disable
local const ICANON: int = 2; # Canonical mode (line buffering)
local const ECHO: int = 8; # Echo input

# Global to store original terminal settings
global g_orig_termios: *void = nullptr;

frame enable_raw_mode() {
    # Allocate space for original and modified termios
    g_orig_termios = malloc(cast<long>(TERMIOS_SIZE));
    local new_termios: *void = malloc(cast<long>(TERMIOS_SIZE));

    # Get current terminal attributes
    tcgetattr(STDIN_FD, g_orig_termios);

    # Copy to new termios
    memcpy(new_termios, g_orig_termios, cast<long>(TERMIOS_SIZE));

    # Get pointer to c_lflag field and disable ICANON and ECHO
    # This keeps output processing (OPOST) enabled so \n works correctly
    local lflag_ptr: *int = cast<*int>(cast<*char>(new_termios) + LFLAG_OFFSET);
    local current_lflag: int = lflag_ptr[0];
    lflag_ptr[0] = current_lflag & (~ICANON) & (~ECHO);

    # Apply modified settings
    tcsetattr(STDIN_FD, TCSANOW, new_termios);

    free(new_termios);
}

frame disable_raw_mode() {
    if (g_orig_termios != nullptr) {
        tcsetattr(STDIN_FD, TCSANOW, g_orig_termios);
        free(g_orig_termios);
        g_orig_termios = nullptr;
    }
}

# Game constants
local const WIDTH: int = 101; # Must be odd for maze generation
local const HEIGHT: int = 49; # Must be odd for maze generation

# Cell types
enum Cell {
    Wall,
    Path,
    Player,
    Exit,
    Visited,
}

# Position struct
struct Pos {
    x: int,
    y: int,

    frame new(x: int, y: int) ret Pos {
        local p: Pos;
        p.x = x;
        p.y = y;
        return p;
    }
}

# Direction for maze generation
struct Dir {
    dx: int,
    dy: int,

    frame new(dx: int, dy: int) ret Dir {
        local d: Dir;
        d.dx = dx;
        d.dy = dy;
        return d;
    }
}

# Maze struct
struct Maze {
    grid: Array<Cell>,
    width: int,
    height: int,
    player_x: int,
    player_y: int,
    exit_x: int,
    exit_y: int,
    rng: *Rand,

    frame new(w: int, h: int, rng: *Rand) ret Maze {
        local m: Maze;
        m.width = w;
        m.height = h;
        m.rng = rng;
        m.grid = Array<Cell>.new(w * h);

        # Initialize grid with walls
        loop (local i: int = 0; i < (w * h); i = i + 1) {
            m.grid.push(Cell.Wall);
        }

        return m;
    }

    frame get(this: *Maze, x: int, y: int) ret Cell {
        if ((x < 0) || (x >= this.width) || (y < 0) || (y >= this.height)) {
            return Cell.Wall;
        }
        return this.grid.get((y * this.width) + x);
    }

    frame set(this: *Maze, x: int, y: int, cell: Cell) {
        if ((x >= 0) && (x < this.width) && (y >= 0) && (y < this.height)) {
            this.grid.set((y * this.width) + x, cell);
        }
    }

    # Generate maze using recursive backtracking (iterative with stack)
    # Then add complexity with extra passages and loops
    # Level affects difficulty: higher levels = fewer loops, more dead ends, more traps
    frame generate(this: *Maze, level: int) {
        # Difficulty scaling based on level
        # At level 1: many loops (easy), few dead ends
        # At higher levels: fewer loops, more dead ends, more traps
        local difficulty: int = level;
        if (difficulty > 20) {
            difficulty = 20; # Cap difficulty at level 20
        }
        # Loop multiplier: starts high (1.5x), decreases with level
        # At level 1: 150% loops, At level 20: 30% loops  
        local loop_mult: int = 150 - (difficulty * 6); # 150 -> 30
        if (loop_mult < 30) {
            loop_mult = 30;
        }
        # Dead end multiplier: starts low (50%), increases with level
        # At level 1: 50% dead ends, At level 20: 300% dead ends
        local dead_end_mult: int = 50 + (difficulty * 12); # 50 -> 290

        # Room count decreases with level (rooms make it easier)
        local room_mult: int = 150 - (difficulty * 7); # 150 -> 10
        if (room_mult < 10) {
            room_mult = 10;
        }
        # Reset to all walls
        loop (local i: int = 0; i < (this.width * this.height); i = i + 1) {
            this.grid.set(i, Cell.Wall);
        }

        # Stack for backtracking
        local stack: Array<Pos> = Array<Pos>.new(this.width * this.height);

        # Start from (1, 1) - ensure this is odd coordinate for maze algorithm
        local start_x: int = 1;
        local start_y: int = 1;
        this.set(start_x, start_y, Cell.Path);
        stack.push(Pos.new(start_x, start_y));

        # Directions: up, down, left, right (move by 2 to skip walls)
        local dirs: Array<Dir> = Array<Dir>.new(4);
        dirs.push(Dir.new(0, -2)); # up
        dirs.push(Dir.new(0, 2)); # down
        dirs.push(Dir.new(-2, 0)); # left
        dirs.push(Dir.new(2, 0)); # right

        loop (stack.len() > 0) {
            local current: Pos = stack.get(stack.len() - 1);

            # Find unvisited neighbors
            local neighbors: Array<int> = Array<int>.new(4);

            loop (local i: int = 0; i < 4; i = i + 1) {
                local d: Dir = dirs.get(i);
                local nx: int = current.x + d.dx;
                local ny: int = current.y + d.dy;

                # Check bounds and if unvisited
                if ((nx > 0) && (nx < (this.width - 1)) && (ny > 0) && (ny < (this.height - 1))) {
                    local cell: Cell = this.get(nx, ny);
                    match (cell) {
                        Cell.Wall => {
                            neighbors.push(i);
                        },
                        _ => {
                        },
                    };
                }
            }

            if (neighbors.len() > 0) {
                # Pick random neighbor
                local idx: int = this.rng.range(0, neighbors.len());
                local dir_idx: int = neighbors.get(idx);
                local d: Dir = dirs.get(dir_idx);

                # Carve path
                local wall_x: int = current.x + (d.dx / 2);
                local wall_y: int = current.y + (d.dy / 2);
                local next_x: int = current.x + d.dx;
                local next_y: int = current.y + d.dy;

                this.set(wall_x, wall_y, Cell.Path);
                this.set(next_x, next_y, Cell.Path);

                stack.push(Pos.new(next_x, next_y));
            } else {
                # Backtrack
                stack.pop();
            }

            neighbors.destroy();
        }

        # ============================================
        # COMPLEXITY PASS 1: Add loops by removing random walls
        # This creates multiple paths to destinations
        # At higher levels, fewer loops = harder navigation
        # ============================================
        local base_loops: int = (this.width * this.height) / 50;
        local num_loops: int = (base_loops * loop_mult) / 100;
        loop (local i: int = 0; i < num_loops; i = i + 1) {
            local wx: int = this.rng.range(2, this.width - 2);
            local wy: int = this.rng.range(2, this.height - 2);

            # Only remove walls that connect two path cells
            if (this.get(wx, wy) == Cell.Wall) {
                local path_neighbors: int = 0;
                if (this.get(wx - 1, wy) == Cell.Path) {
                    path_neighbors = path_neighbors + 1;
                }
                if (this.get(wx + 1, wy) == Cell.Path) {
                    path_neighbors = path_neighbors + 1;
                }
                if (this.get(wx, wy - 1) == Cell.Path) {
                    path_neighbors = path_neighbors + 1;
                }
                if (this.get(wx, wy + 1) == Cell.Path) {
                    path_neighbors = path_neighbors + 1;
                }
                # Remove wall if it connects exactly 2 path cells (creates a loop)
                if (path_neighbors == 2) {
                    this.set(wx, wy, Cell.Path);
                }
            }
        }

        # ============================================
        # COMPLEXITY PASS 2: Create "rooms" - small open areas
        # Rooms decrease with level (they make navigation easier)
        # ============================================
        local base_rooms: int = (this.width * this.height) / 400;
        local num_rooms: int = (base_rooms * room_mult) / 100;
        loop (local i: int = 0; i < num_rooms; i = i + 1) {
            local room_x: int = this.rng.range(5, this.width - 8);
            local room_y: int = this.rng.range(5, this.height - 8);
            local room_w: int = this.rng.range(3, 6);
            local room_h: int = this.rng.range(3, 5);

            # Make sure room dimensions are odd for alignment
            if ((room_x % 2) == 0) {
                room_x = room_x + 1;
            }
            if ((room_y % 2) == 0) {
                room_y = room_y + 1;
            }
            # Carve out the room
            loop (local ry: int = 0; ry < room_h; ry = ry + 1) {
                loop (local rx: int = 0; rx < room_w; rx = rx + 1) {
                    local px: int = room_x + rx;
                    local py: int = room_y + ry;
                    if ((px > 1) && (px < (this.width - 2)) && (py > 1) && (py < (this.height - 2))) {
                        this.set(px, py, Cell.Path);
                    }
                }
            }
        }

        # ============================================
        # COMPLEXITY PASS 3: Add decoy dead ends
        # Short passages that look promising but lead nowhere
        # More dead ends at higher levels = more traps
        # ============================================
        local base_decoys: int = (this.width * this.height) / 100;
        local num_decoys: int = (base_decoys * dead_end_mult) / 100;
        loop (local i: int = 0; i < num_decoys; i = i + 1) {
            local dx: int = this.rng.range(3, this.width - 4);
            local dy: int = this.rng.range(3, this.height - 4);

            # Find a wall adjacent to a path
            if (this.get(dx, dy) == Cell.Wall) {
                local dir: int = this.rng.range(0, 4);
                local ddx: int = 0;
                local ddy: int = 0;
                if (dir == 0) {
                    ddy = -1;
                } else if (dir == 1) {
                    ddy = 1;
                } else if (dir == 2) {
                    ddx = -1;
                } else {
                    ddx = 1;
                }

                # Check if adjacent cell is path
                if (this.get(dx + ddx, dy + ddy) == Cell.Path) {
                    # Carve a short dead end in opposite direction
                    local dead_len: int = this.rng.range(2, 5);
                    local valid: bool = true;

                    # Check if we can carve without hitting edge
                    loop (local j: int = 0; (j < dead_len) && valid; j = j + 1) {
                        local nx: int = dx - (ddx * j);
                        local ny: int = dy - (ddy * j);
                        if ((nx <= 1) || (nx >= (this.width - 2)) || (ny <= 1) || (ny >= (this.height - 2))) {
                            valid = false;
                        }
                    }

                    if (valid) {
                        loop (local j: int = 0; j < dead_len; j = j + 1) {
                            local nx: int = dx - (ddx * j);
                            local ny: int = dy - (ddy * j);
                            this.set(nx, ny, Cell.Path);
                        }
                    }
                }
            }
        }

        # ============================================
        # COMPLEXITY PASS 4: Add cross-connections
        # Horizontal and vertical passages that cross the maze
        # ============================================
        local num_crosses: int = this.rng.range(2, 5);
        loop (local i: int = 0; i < num_crosses; i = i + 1) {
            if (this.rng.nextBool()) {
                # Horizontal passage
                local y: int = this.rng.range(5, this.height - 6);
                if ((y % 2) == 0) {
                    y = y + 1;
                }
                local start_x: int = this.rng.range(3, this.width / 3);
                local end_x: int = this.rng.range((this.width * 2) / 3, this.width - 4);

                loop (local x: int = start_x; x < end_x; x = x + 1) {
                    if ((x > 1) && (x < (this.width - 2))) {
                        this.set(x, y, Cell.Path);
                    }
                }
            } else {
                # Vertical passage
                local x: int = this.rng.range(5, this.width - 6);
                if ((x % 2) == 0) {
                    x = x + 1;
                }
                local start_y: int = this.rng.range(3, this.height / 3);
                local end_y: int = this.rng.range((this.height * 2) / 3, this.height - 4);

                loop (local y: int = start_y; y < end_y; y = y + 1) {
                    if ((y > 1) && (y < (this.height - 2))) {
                        this.set(x, y, Cell.Path);
                    }
                }
            }
        }

        dirs.destroy();
        stack.destroy();

        # ============================================
        # SPAWN POSITIONS: Randomize start/end locations
        # Either: Player in corner -> Exit in middle
        # Or:     Player in middle -> Exit in corner
        # This forces interesting navigation patterns
        # ============================================

        local mid_x: int = this.width / 2;
        local mid_y: int = this.height / 2;
        # Ensure middle coords are odd (valid path positions)
        if ((mid_x % 2) == 0) {
            mid_x = mid_x + 1;
        }
        if ((mid_y % 2) == 0) {
            mid_y = mid_y + 1;
        }
        local corner_x: int = this.width - 2;
        local corner_y: int = this.height - 2;

        # Randomly choose configuration (50/50)
        local spawn_config: int = this.rng.range(0, 2);

        if (spawn_config == 0) {
            # Player starts at top-left corner, exit in middle
            this.player_x = 1;
            this.player_y = 1;
            this.exit_x = mid_x;
            this.exit_y = mid_y;
        } else {
            # Player starts in middle, exit at bottom-right corner
            this.player_x = mid_x;
            this.player_y = mid_y;
            this.exit_x = corner_x;
            this.exit_y = corner_y;
        }

        # Ensure player position is a path
        this.set(this.player_x, this.player_y, Cell.Path);

        # Carve paths around player to ensure they can move
        if ((this.player_x > 1) && (this.get(this.player_x - 1, this.player_y) == Cell.Wall)) {
            this.set(this.player_x - 1, this.player_y, Cell.Path);
        }
        if ((this.player_x < (this.width - 2)) && (this.get(this.player_x + 1, this.player_y) == Cell.Wall)) {
            this.set(this.player_x + 1, this.player_y, Cell.Path);
        }
        if ((this.player_y > 1) && (this.get(this.player_x, this.player_y - 1) == Cell.Wall)) {
            this.set(this.player_x, this.player_y - 1, Cell.Path);
        }
        if ((this.player_y < (this.height - 2)) && (this.get(this.player_x, this.player_y + 1) == Cell.Wall)) {
            this.set(this.player_x, this.player_y + 1, Cell.Path);
        }
        # Ensure exit is on a path - find nearest path cell if needed
        if (this.get(this.exit_x, this.exit_y) == Cell.Wall) {
            local found: bool = false;
            loop (local radius: int = 0; (radius < 5) && !found; radius = radius + 1) {
                loop (local dy: int = -radius; (dy <= radius) && !found; dy = dy + 1) {
                    loop (local dx: int = -radius; (dx <= radius) && !found; dx = dx + 1) {
                        local tx: int = this.exit_x + dx;
                        local ty: int = this.exit_y + dy;
                        if ((tx > 0) && (tx < (this.width - 1)) && (ty > 0) && (ty < (this.height - 1))) {
                            if (this.get(tx, ty) == Cell.Path) {
                                this.exit_x = tx;
                                this.exit_y = ty;
                                found = true;
                            }
                        }
                    }
                }
            }
        }
        # ============================================
        # ANTI-SHORTCUT: Add walls to block direct paths
        # Create barriers that force the player to navigate around
        # ============================================

        # Calculate direction from player to exit
        local px: int = this.player_x;
        local py: int = this.player_y;
        local ex: int = this.exit_x;
        local ey: int = this.exit_y;

        # Add barrier walls between player and exit
        # These force the player to go around instead of directly
        local barrier_count: int = 3 + (level / 5); # More barriers at higher levels
        if (barrier_count > 8) {
            barrier_count = 8;
        }
        loop (local b: int = 0; b < barrier_count; b = b + 1) {
            # Calculate a point between player and exit
            local t: int = ((b + 1) * 100) / (barrier_count + 1); # percentage along path
            local bx: int = px + (((ex - px) * t) / 100);
            local by: int = py + (((ey - py) * t) / 100);

            # Create a barrier perpendicular to the direct path
            local barrier_len: int = 5 + this.rng.range(0, 8);

            # Determine barrier orientation (perpendicular to path)
            local dx_path: int = ex - px;
            local dy_path: int = ey - py;

            if (dx_path < 0) {
                dx_path = -dx_path;
            }
            if (dy_path < 0) {
                dy_path = -dy_path;
            }
            if (dx_path > dy_path) {
                # Path is more horizontal, so barrier is vertical
                loop (local i: int = -barrier_len; i <= barrier_len; i = i + 1) {
                    local wy: int = by + i;
                    if ((wy > 1) && (wy < (this.height - 2))) {
                        # Don't block if it's adjacent to player or exit
                        local dist_to_player: int = ((bx - px) * (bx - px)) + ((wy - py) * (wy - py));
                        local dist_to_exit: int = ((bx - ex) * (bx - ex)) + ((wy - ey) * (wy - ey));
                        if ((dist_to_player > 16) && (dist_to_exit > 16)) {
                            this.set(bx, wy, Cell.Wall);
                        }
                    }
                }
            } else {
                # Path is more vertical, so barrier is horizontal
                loop (local i: int = -barrier_len; i <= barrier_len; i = i + 1) {
                    local wx: int = bx + i;
                    if ((wx > 1) && (wx < (this.width - 2))) {
                        local dist_to_player: int = ((wx - px) * (wx - px)) + ((by - py) * (by - py));
                        local dist_to_exit: int = ((wx - ex) * (wx - ex)) + ((by - ey) * (by - ey));
                        if ((dist_to_player > 16) && (dist_to_exit > 16)) {
                            this.set(wx, by, Cell.Wall);
                        }
                    }
                }
            }
        }

        # Ensure player and exit areas remain accessible after barriers
        # Re-carve small area around player
        this.set(this.player_x, this.player_y, Cell.Path);
        if (this.player_x > 1) {
            this.set(this.player_x - 1, this.player_y, Cell.Path);
        }
        if (this.player_x < (this.width - 2)) {
            this.set(this.player_x + 1, this.player_y, Cell.Path);
        }
        if (this.player_y > 1) {
            this.set(this.player_x, this.player_y - 1, Cell.Path);
        }
        if (this.player_y < (this.height - 2)) {
            this.set(this.player_x, this.player_y + 1, Cell.Path);
        }
        # Re-carve area around exit
        this.set(this.exit_x, this.exit_y, Cell.Path);
        if (this.exit_x > 1) {
            this.set(this.exit_x - 1, this.exit_y, Cell.Path);
        }
        if (this.exit_x < (this.width - 2)) {
            this.set(this.exit_x + 1, this.exit_y, Cell.Path);
        }
        if (this.exit_y > 1) {
            this.set(this.exit_x, this.exit_y - 1, Cell.Path);
        }
        if (this.exit_y < (this.height - 2)) {
            this.set(this.exit_x, this.exit_y + 1, Cell.Path);
        }
    }

    frame move_player(this: *Maze, dx: int, dy: int) ret bool {
        local new_x: int = this.player_x + dx;
        local new_y: int = this.player_y + dy;

        # Check if reached exit
        if ((new_x == this.exit_x) && (new_y == this.exit_y)) {
            this.player_x = new_x;
            this.player_y = new_y;
            return true; # Reached exit!
        }
        # Check if can move
        local target: Cell = this.get(new_x, new_y);
        match (target) {
            Cell.Path => {
                this.player_x = new_x;
                this.player_y = new_y;
            },
            Cell.Visited => {
                this.player_x = new_x;
                this.player_y = new_y;
            },
            _ => {
            },
        };

        return false;
    }

    frame render(this: *Maze, score: int, level: int) {
        # Clear screen
        printf("\x1b[2J\x1b[H");

        # Title
        printf("\x1b[1;36m╔════════════════════════════════════╗\x1b[0m\n");
        printf("\x1b[1;36m║     \x1b[1;33mINFINITE MAZE RUNNER\x1b[1;36m          ║\x1b[0m\n");
        printf("\x1b[1;36m╚════════════════════════════════════╝\x1b[0m\n");

        # Top border
        printf("\x1b[90m");
        loop (local x: int = 0; x < (this.width + 2); x = x + 1) {
            printf("█");
        }
        printf("\x1b[0m\n");

        # Maze
        loop (local y: int = 0; y < this.height; y = y + 1) {
            printf("\x1b[90m█\x1b[0m"); # Left border

            loop (local x: int = 0; x < this.width; x = x + 1) {
                if ((x == this.player_x) && (y == this.player_y)) {
                    # Player - bright yellow
                    printf("\x1b[1;33m@\x1b[0m");
                } else if ((x == this.exit_x) && (y == this.exit_y)) {
                    # Exit - bright green, blinking
                    printf("\x1b[1;32;5m★\x1b[0m");
                } else {
                    local cell: Cell = this.get(x, y);
                    match (cell) {
                        Cell.Wall => {
                            printf("\x1b[90m█\x1b[0m");
                        },
                        Cell.Path => {
                            printf(" ");
                        },
                        Cell.Visited => {
                            printf("\x1b[34m·\x1b[0m");
                        },
                        _ => {
                            printf(" ");
                        },
                    };
                }
            }

            printf("\x1b[90m█\x1b[0m\n"); # Right border
        }

        # Bottom border
        printf("\x1b[90m");
        loop (local x: int = 0; x < (this.width + 2); x = x + 1) {
            printf("█");
        }
        printf("\x1b[0m\n");

        # Stats
        printf("\n");
        printf("\x1b[1;37mLevel: \x1b[1;36m%d\x1b[0m  |  ", level);
        printf("\x1b[1;37mScore: \x1b[1;32m%d\x1b[0m\n", score);
        printf("\n");
        printf("\x1b[90mMove: \x1b[37mWASD/Arrows\x1b[90m | Skip: \x1b[37mN\x1b[90m | Level: \x1b[37m+/-\x1b[90m | Regen: \x1b[37mR\x1b[90m | Quit: \x1b[37mQ\x1b[0m\n");
        printf("\x1b[90mReach the \x1b[1;32m★\x1b[0m\x1b[90m to advance! (Difficulty scales with level)\x1b[0m\n");
    }

    frame destroy(this: *Maze) {
        this.grid.destroy();
    }
}

# Game struct
struct Game {
    maze: Maze,
    score: int,
    level: int,
    rng: Rand,
    running: bool,

    frame new() ret Game {
        local g: Game;
        g.rng = Rand.seedFromTime();
        g.score = 0;
        g.level = 1;
        g.running = true;
        g.maze = Maze.new(WIDTH, HEIGHT, &g.rng);
        g.maze.generate(g.level);
        return g;
    }

    frame next_level(this: *Game) {
        this.level = this.level + 1;
        this.score = this.score + (this.level * 100);

        # Destroy old maze and create new one
        this.maze.destroy();
        this.maze = Maze.new(WIDTH, HEIGHT, &this.rng);
        this.maze.generate(this.level);
    }

    frame set_level(this: *Game, new_level: int) {
        if (new_level < 1) {
            new_level = 1;
        }
        this.level = new_level;

        # Regenerate maze for new level
        this.maze.destroy();
        this.maze = Maze.new(WIDTH, HEIGHT, &this.rng);
        this.maze.generate(this.level);
    }

    frame handle_input(this: *Game, input: int) {
        local dx: int = 0;
        local dy: int = 0;

        # Check for escape sequence (arrow keys)
        # Arrow keys send: ESC (27) + [ (91) + A/B/C/D
        if (input == 27) {
            # ESC
            local seq1: int = getchar();
            if (seq1 == 91) {
                # [
                local seq2: int = getchar();
                if (seq2 == 65) {
                    # Up arrow
                    dy = -1;
                } else if (seq2 == 66) {
                    # Down arrow
                    dy = 1;
                } else if (seq2 == 67) {
                    # Right arrow
                    dx = 1;
                } else if (seq2 == 68) {
                    # Left arrow
                    dx = -1;
                }
                # W
            }
        } else if ((input == 119) || (input == 87)) {
            dy = -1;
        } else if ((input == 115) || (input == 83)) {
            # S
            dy = 1;
        } else if ((input == 97) || (input == 65)) {
            # A (not 'A' since that's used for something else)
            dx = -1;
        } else if ((input == 100) || (input == 68)) {
            # D
            dx = 1;
        } else if ((input == 113) || (input == 81) || (input == -1)) {
            # Q or EOF
            this.running = false;
            return;
        } else if ((input == 110) || (input == 78)) {
            # N - skip to next level
            this.next_level();
            return;
        } else if ((input == 61) || (input == 43)) {
            # = or + - increase level
            this.set_level(this.level + 1);
            return;
        } else if (input == 45) {
            # - decrease level
            this.set_level(this.level - 1);
            return;
        } else if ((input == 114) || (input == 82)) {
            # R - regenerate current level
            this.set_level(this.level);
            return;
        }
        if ((dx != 0) || (dy != 0)) {
            local reached_exit: bool = this.maze.move_player(dx, dy);
            if (reached_exit) {
                this.next_level();
            }
        }
    }

    frame render(this: *Game) {
        this.maze.render(this.score, this.level);
    }

    frame destroy(this: *Game) {
        this.maze.destroy();
    }
}

frame main() ret int {
    # Welcome screen
    printf("\x1b[2J\x1b[H");
    printf("\n");
    printf("\x1b[1;36m╔════════════════════════════════════════╗\x1b[0m\n");
    printf("\x1b[1;36m║                                        ║\x1b[0m\n");
    printf("\x1b[1;36m║     \x1b[1;33m♦ INFINITE MAZE RUNNER ♦\x1b[1;36m          ║\x1b[0m\n");
    printf("\x1b[1;36m║                                        ║\x1b[0m\n");
    printf("\x1b[1;36m╚════════════════════════════════════════╝\x1b[0m\n");
    printf("\n");
    printf("\x1b[37mNavigate through endless mazes!\x1b[0m\n");
    printf("\n");
    printf("\x1b[90m┌─────────────────────────────────┐\x1b[0m\n");
    printf("\x1b[90m│\x1b[0m  \x1b[1;33m@\x1b[0m = You                         \x1b[90m│\x1b[0m\n");
    printf("\x1b[90m│\x1b[0m  \x1b[1;32m★\x1b[0m = Exit (reach to advance!)    \x1b[90m│\x1b[0m\n");
    printf("\x1b[90m│\x1b[0m  \x1b[90m█\x1b[0m = Wall                         \x1b[90m│\x1b[0m\n");
    printf("\x1b[90m└─────────────────────────────────┘\x1b[0m\n");
    printf("\n");
    printf("\x1b[37mControls:\x1b[0m\n");
    printf("  \x1b[1;37mW/A/S/D\x1b[0m or \x1b[1;37mArrow Keys\x1b[0m - Move\n");
    printf("  \x1b[1;37mN\x1b[0m       - Skip level\n");
    printf("  \x1b[1;37m+/-\x1b[0m     - Change level (testing)\n");
    printf("  \x1b[1;37mR\x1b[0m       - Regenerate maze\n");
    printf("  \x1b[1;37mQ\x1b[0m       - Quit\n");
    printf("\n");
    printf("\x1b[1;32mPress any key to start...\x1b[0m\n");

    # Enable raw mode for instant keypress detection
    enable_raw_mode();
    getchar(); # Wait for any key

    local game: Game = Game.new();

    loop (game.running) {
        game.render();

        local input: int = getchar();
        game.handle_input(input);
    }

    # Restore terminal before final output
    disable_raw_mode();

    # Final screen
    printf("\x1b[2J\x1b[H");
    printf("\n");
    printf("\x1b[1;36m╔════════════════════════════════════╗\x1b[0m\n");
    printf("\x1b[1;36m║         \x1b[1;33mGAME OVER!\x1b[1;36m                 ║\x1b[0m\n");
    printf("\x1b[1;36m╚════════════════════════════════════╝\x1b[0m\n");
    printf("\n");
    printf("\x1b[1;37mFinal Level: \x1b[1;36m%d\x1b[0m\n", game.level);
    printf("\x1b[1;37mFinal Score: \x1b[1;32m%d\x1b[0m\n", game.score);
    printf("\n");
    printf("\x1b[90mThanks for playing!\x1b[0m\n");

    game.destroy();

    return 0;
}

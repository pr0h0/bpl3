# Snake Game
# Classic snake game with ASCII graphics
# Uses raw terminal mode for instant keypress detection

import [Rand] from "std/rand.bpl";
import [Array] from "std/array.bpl";

extern printf(fmt: string, ...);
extern getchar() ret int;
extern usleep(usec: int) ret int;
extern malloc(size: u64) ret *void;
extern free(ptr: *void);
extern memcpy(dest: *void, src: *void, n: u64) ret *void;

# Terminal control (POSIX)
extern tcgetattr(fd: int, termios: *void) ret int;
extern tcsetattr(fd: int, optional_actions: int, termios: *void) ret int;

# Non-blocking input (POSIX)
extern fcntl(fd: int, cmd: int, arg: int) ret int;
extern read(fd: int, buf: *void, count: int) ret int;

# Game constants
local const WIDTH: int = 40;
local const HEIGHT: int = 20;
local const INITIAL_LENGTH: int = 3;
local const GAME_SPEED: int = 100000; # microseconds between moves (100ms)

# Terminal settings storage
global original_termios: *u8 = nullptr;
local const TERMIOS_SIZE: u64 = 60;
local const LFLAG_OFFSET: int = 12; # Offset to c_lflag in termios struct

# Direction enum
enum Direction {
    Up,
    Down,
    Left,
    Right,
}

# ============================================
# Terminal Mode Functions
# ============================================

frame enable_raw_mode() {
    original_termios = cast<*u8>(malloc(TERMIOS_SIZE));
    tcgetattr(0, cast<*void>(original_termios));

    local new_termios: *u8 = cast<*u8>(malloc(TERMIOS_SIZE));
    memcpy(cast<*void>(new_termios), cast<*void>(original_termios), TERMIOS_SIZE);

    # Disable canonical mode (ICANON = 2) and echo (ECHO = 8)
    local lflag_ptr: *u32 = cast<*u32>(new_termios + LFLAG_OFFSET);
    local current_flags: u32 = *lflag_ptr;
    current_flags = current_flags & cast<u32>(~(2 | 8)); # Clear ICANON and ECHO
    *lflag_ptr = current_flags;

    tcsetattr(0, 0, cast<*void>(new_termios));
    free(cast<*void>(new_termios));

    # Set stdin to non-blocking mode
    # F_GETFL = 3, F_SETFL = 4, O_NONBLOCK = 2048
    local flags: int = fcntl(0, 3, 0);
    fcntl(0, 4, flags | 2048);
}

frame disable_raw_mode() {
    if (original_termios != nullptr) {
        tcsetattr(0, 0, cast<*void>(original_termios));

        # Restore blocking mode
        local flags: int = fcntl(0, 3, 0);
        fcntl(0, 4, flags & (~2048));

        free(cast<*void>(original_termios));
        original_termios = nullptr;
    }
}

frame read_key() ret int {
    local buf: u8 = 0;
    local result: int = read(0, cast<*void>(&buf), 1);
    if (result > 0) {
        return cast<int>(buf);
    }
    return -1;
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

    frame equals(this: *Pos, other: *Pos) ret bool {
        return (this.x == other.x) && (this.y == other.y);
    }
}

# Snake struct
struct Snake {
    body: Array<Pos>,
    direction: Direction,
    grow_pending: int,

    frame new(start_x: int, start_y: int) ret Snake {
        local s: Snake;
        s.body = Array<Pos>.new(100);
        s.direction = Direction.Right;
        s.grow_pending = 0;

        # Create initial snake body
        loop (local i: int = 0; i < INITIAL_LENGTH; i = i + 1) {
            s.body.push(Pos.new(start_x - i, start_y));
        }

        return s;
    }

    frame head(this: *Snake) ret Pos {
        return this.body.get(0);
    }

    frame move(this: *Snake) {
        local head: Pos = this.head();
        local new_head: Pos;

        match (this.direction) {
            Direction.Up => {
                new_head = Pos.new(head.x, head.y - 1);
            },
            Direction.Down => {
                new_head = Pos.new(head.x, head.y + 1);
            },
            Direction.Left => {
                new_head = Pos.new(head.x - 1, head.y);
            },
            Direction.Right => {
                new_head = Pos.new(head.x + 1, head.y);
            },
        };

        # Shift all elements back and add new head at front
        # First, determine if we grow or not
        local new_len: int = this.body.len();
        if (this.grow_pending > 0) {
            this.grow_pending = this.grow_pending - 1;
            this.body.push(Pos.new(0, 0)); # placeholder
            new_len = this.body.len();
        }
        # Shift elements: move each element to the next position
        loop (local i: int = new_len - 1; i > 0; i = i - 1) {
            local prev: Pos = this.body.get(i - 1);
            this.body.set(i, prev);
        }

        # Set new head
        this.body.set(0, new_head);
    }

    frame grow(this: *Snake) {
        this.grow_pending = this.grow_pending + 1;
    }

    frame collides_with_self(this: *Snake) ret bool {
        local head: Pos = this.head();
        loop (local i: int = 1; i < this.body.len(); i = i + 1) {
            local segment: Pos = this.body.get(i);
            if ((head.x == segment.x) && (head.y == segment.y)) {
                return true;
            }
        }
        return false;
    }

    frame collides_with_wall(this: *Snake) ret bool {
        local head: Pos = this.head();
        return (head.x < 0) || (head.x >= WIDTH) || (head.y < 0) || (head.y >= HEIGHT);
    }

    frame contains(this: *Snake, x: int, y: int) ret bool {
        loop (local i: int = 0; i < this.body.len(); i = i + 1) {
            local segment: Pos = this.body.get(i);
            if ((segment.x == x) && (segment.y == y)) {
                return true;
            }
        }
        return false;
    }
}

# Game struct
struct Game {
    snake: Snake,
    food: Pos,
    score: int,
    game_over: bool,
    rng: Rand,

    frame new() ret Game {
        local g: Game;
        g.snake = Snake.new(WIDTH / 2, HEIGHT / 2);
        g.score = 0;
        g.game_over = false;
        g.rng = Rand.seedFromTime();
        g.spawn_food();
        return g;
    }

    frame spawn_food(this: *Game) {
        loop {
            local x: int = this.rng.range(0, WIDTH);
            local y: int = this.rng.range(0, HEIGHT);

            if (!this.snake.contains(x, y)) {
                this.food = Pos.new(x, y);
                break;
            }
        }
    }

    frame update(this: *Game) {
        if (this.game_over) {
            return;
        }
        this.snake.move();

        # Check wall collision
        if (this.snake.collides_with_wall()) {
            this.game_over = true;
            return;
        }
        # Check self collision
        if (this.snake.collides_with_self()) {
            this.game_over = true;
            return;
        }
        # Check food collision
        local head: Pos = this.snake.head();
        if ((head.x == this.food.x) && (head.y == this.food.y)) {
            this.snake.grow();
            this.score = this.score + 10;
            this.spawn_food();
        }
    }

    frame handle_input(this: *Game, input: int) ret bool {
        # Check for quit
        if ((input == 113) || (input == 81)) {
            # q or Q
            return false; # Signal to quit
        }
        # Handle escape sequences for arrow keys
        if (input == 27) {
            # ESC
            local next: int = read_key();
            if (next == 91) {
                # [
                local arrow: int = read_key();
                if (arrow == 65) {
                    input = 65; # Up
                } else if (arrow == 66) {
                    input = 66; # Down
                } else if (arrow == 67) {
                    input = 67; # Right
                } else if (arrow == 68) {
                    input = 68; # Left
                }
            }
        }
        # w = 119, W = 87, s = 115, S = 83, a = 97, A = 65 (conflict with Up arrow)
        # d = 100, D = 68 (conflict with Left arrow)
        # Arrow keys after escape: Up=65, Down=66, Right=67, Left=68

        # Prevent 180-degree turns (can't go directly opposite)
        match (this.snake.direction) {
            Direction.Up => {
                if ((input == 97) || (input == 68)) {
                    # a or Left arrow
                    this.snake.direction = Direction.Left;
                } else if ((input == 100) || (input == 67)) {
                    # d or Right arrow
                    this.snake.direction = Direction.Right;
                } else if ((input == 115) || (input == 83) || (input == 66)) {
                    # s/S or Down arrow
                    # Can't go down when going up - ignore
                }
            },
            Direction.Down => {
                if ((input == 97) || (input == 68)) {
                    this.snake.direction = Direction.Left;
                } else if ((input == 100) || (input == 67)) {
                    this.snake.direction = Direction.Right;
                } else if ((input == 119) || (input == 87) || (input == 65)) {
                    # w/W or Up arrow
                    # Can't go up when going down - ignore  
                }
            },
            Direction.Left => {
                if ((input == 119) || (input == 87) || (input == 65)) {
                    # w/W or Up arrow
                    this.snake.direction = Direction.Up;
                } else if ((input == 115) || (input == 83) || (input == 66)) {
                    # s/S or Down arrow
                    this.snake.direction = Direction.Down;
                } else if ((input == 100) || (input == 67)) {
                    # d or Right arrow
                    # Can't go right when going left - ignore
                }
            },
            Direction.Right => {
                if ((input == 119) || (input == 87) || (input == 65)) {
                    this.snake.direction = Direction.Up;
                } else if ((input == 115) || (input == 83) || (input == 66)) {
                    this.snake.direction = Direction.Down;
                } else if ((input == 97) || (input == 68)) {
                    # a or Left arrow
                    # Can't go left when going right - ignore
                }
            },
        };

        return true; # Continue game
    }

    frame render(this: *Game) {
        # Clear screen and move cursor to top-left
        printf("\x1b[2J\x1b[H");

        # Draw top border
        printf("+");
        loop (local i: int = 0; i < WIDTH; i = i + 1) {
            printf("-");
        }
        printf("+\n");

        # Draw game area
        loop (local y: int = 0; y < HEIGHT; y = y + 1) {
            printf("|");
            loop (local x: int = 0; x < WIDTH; x = x + 1) {
                local head: Pos = this.snake.head();

                if ((x == head.x) && (y == head.y)) {
                    # Snake head (green)
                    printf("\x1b[32m@\x1b[0m");
                } else if (this.snake.contains(x, y)) {
                    # Snake body (green)
                    printf("\x1b[32mo\x1b[0m");
                } else if ((x == this.food.x) && (y == this.food.y)) {
                    # Food (red)
                    printf("\x1b[31m*\x1b[0m");
                } else {
                    printf(" ");
                }
            }
            printf("|\n");
        }

        # Draw bottom border
        printf("+");
        loop (local i: int = 0; i < WIDTH; i = i + 1) {
            printf("-");
        }
        printf("+\n");

        # Draw score
        printf("Score: %d  |  Length: %d\n", this.score, this.snake.body.len());
        printf("Controls: WASD/Arrows to turn, Q to quit\n");

        if (this.game_over) {
            printf("\n\x1b[31m*** GAME OVER! ***\x1b[0m\n");
            printf("Final Score: %d\n", this.score);
            printf("Press any key to exit...\n");
        }
    }
}

# Main game loop with real-time controls

frame main() ret int {
    printf("\x1b[2J\x1b[H");
    printf("╔════════════════════════════════════╗\n");
    printf("║          SNAKE GAME                ║\n");
    printf("╠════════════════════════════════════╣\n");
    printf("║                                    ║\n");
    printf("║  Controls:                         ║\n");
    printf("║    W/↑ - Turn Up                   ║\n");
    printf("║    S/↓ - Turn Down                 ║\n");
    printf("║    A/← - Turn Left                 ║\n");
    printf("║    D/→ - Turn Right                ║\n");
    printf("║    Q   - Quit                      ║\n");
    printf("║                                    ║\n");
    printf("║  Eat the red * to grow!            ║\n");
    printf("║  Don't hit walls or yourself!      ║\n");
    printf("║                                    ║\n");
    printf("╚════════════════════════════════════╝\n");
    printf("\nPress any key to start...\n");

    # Wait for keypress in blocking mode first
    getchar();

    # Enable raw mode for real-time input
    enable_raw_mode();

    local game: Game = Game.new();
    local running: bool = true;

    # Main game loop - snake moves automatically
    loop (running && !game.game_over) {
        game.render();

        # Process all pending input (non-blocking)
        local input: int = read_key();
        loop (input != -1) {
            running = game.handle_input(input);
            if (!running) {
                break;
            }
            input = read_key();
        }

        # Exit immediately if user pressed Q (don't wait for sleep)
        if (!running) {
            break;
        }
        game.update();

        # Control game speed
        usleep(GAME_SPEED);
    }

    # Restore terminal first (important!)
    disable_raw_mode();

    # Only show final state if game over (not if user quit)
    if (game.game_over) {
        game.render();
        printf("\nPress any key to exit...\n");
        getchar();
    }
    printf("\nThanks for playing!\n");

    return 0;
}

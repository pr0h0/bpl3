import [Grid], [Tile], [TileType] from "./src/world.bpl";
import [Player], [Monster], [MonsterType], [Entity] from "./src/entities.bpl";
import [Renderer] from "./src/render.bpl";
import random_range from "./src/utils.bpl";
import [Array] from "std/array.bpl";

import [printf] from "std/c.bpl";
extern getchar() ret int;

# Game Constants
local const WIDTH: int = 40;
local const HEIGHT: int = 20;

frame main() ret int {
    # Initialize Map
    local default_tile: Tile;
    default_tile.kind = TileType.Floor;
    default_tile.visible = true;
    default_tile.seen = true;

    local map: Grid<Tile> = Grid<Tile>.new(WIDTH, HEIGHT, default_tile);

    # Create Walls (Simple Box)
    local wall: Tile;
    wall.kind = TileType.Wall;
    wall.visible = true;
    wall.seen = true;

    loop (local x: int = 0; x < WIDTH; x = x + 1) {
        map.set(x, 0, wall);
        map.set(x, HEIGHT - 1, wall);
    }
    loop (local y: int = 0; y < HEIGHT; y = y + 1) {
        map.set(0, y, wall);
        map.set(WIDTH - 1, y, wall);
    }

    # Add some random walls
    loop (local i: int = 0; i < 20; i = i + 1) {
        local rx: int = random_range(1, WIDTH - 1);
        local ry: int = random_range(1, HEIGHT - 1);
        map.set(rx, ry, wall);
    }

    # Initialize Player
    local player: Player = Player.new(WIDTH / 2, HEIGHT / 2);

    # Initialize Monsters
    local monsters: Array<Monster> = Array<Monster>.new(5);
    monsters.push(Monster.new(5, 5, MonsterType.Goblin));
    monsters.push(Monster.new(WIDTH - 5, HEIGHT - 5, MonsterType.Orc));
    monsters.push(Monster.new(5, HEIGHT - 5, MonsterType.Goblin));

    # Initialize Renderer
    local renderer: Renderer;
    renderer.width = WIDTH;
    renderer.height = HEIGHT;

    # Game Loop
    local running: bool = true;

    loop (running) {
        # Clear screen initially
        renderer.clear_screen();

        # Render
        renderer.draw_map(&map);

        # Draw Monsters
        loop (local i: int = 0; i < monsters.len(); i = i + 1) {
            local m: *Monster = monsters.getRef(i);
            if (m.is_alive()) {
                renderer.draw_entity(cast<*Entity>(m));
            }
        }

        # Draw Player
        renderer.draw_entity(cast<*Entity>(&player));

        # Draw UI
        renderer.draw_ui(&player);

        # Input
        local input: int = getchar();
        local dx: int = 0;
        local dy: int = 0;

        if ((input == 113) || (input == -1)) {
            # 'q' or EOF
            running = false;
        }
        # 'w'
        if (input == 119) {
            dy = -1;
        }
        # 's'
        if (input == 115) {
            dy = 1;
        }
        # 'a'
        if (input == 97) {
            dx = -1;
        }
        # 'd'
        if (input == 100) {
            dx = 1;
        }
        if ((dx != 0) || (dy != 0)) {
            local new_x: int = player.x + dx;
            local new_y: int = player.y + dy;

            # Check Monster Collision (Attack)
            local attacked: bool = false;
            loop (local i: int = 0; i < monsters.len(); i = i + 1) {
                local m: *Monster = monsters.getRef(i);
                if (m.is_alive() && (m.x == new_x) && (m.y == new_y)) {
                    # Attack!
                    m.take_damage(player.attack);
                    # printf("You hit %s for %d damage!\n", m.name, player.attack);
                    if (!m.is_alive()) {
                        player.xp = player.xp + 10;
                    }
                    attacked = true;
                }
            }

            if (!attacked) {
                # Check Map Collision
                local target_tile: Tile = map.get(new_x, new_y);
                local blocked: bool = false;

                match (target_tile.kind) {
                    TileType.Wall => {
                        blocked = true;
                    },
                    TileType.Door(open) => {
                        if (!open) 
                            blocked = true;
                    },
                    TileType.Floor => {
                        blocked = false;
                    },
                };
                if (!blocked) {
                    player.x = new_x;
                    player.y = new_y;
                }
            }
            # Monster Turn
            loop (local i: int = 0; i < monsters.len(); i = i + 1) {
                local m: *Monster = monsters.getRef(i);
                if (m.is_alive()) {
                    # Simple AI: Move towards player
                    local mdx: int = 0;
                    local mdy: int = 0;

                    if (player.x > m.x) 
                        mdx = 1;
                    if (player.x < m.x) 
                        mdx = -1;
                    if (player.y > m.y) 
                        mdy = 1;
                    if (player.y < m.y) 
                        mdy = -1;
                    # Randomize slightly to avoid getting stuck
                    if (random_range(0, 2) == 0) {
                        if (mdx != 0) 
                            mdy = 0;
                    } else {
                        if (mdy != 0) 
                            mdx = 0;
                    }

                    local mx: int = m.x + mdx;
                    local my: int = m.y + mdy;

                    # Check collision with player
                    if ((mx == player.x) && (my == player.y)) {
                        # Attack player
                        player.take_damage(m.attack);
                    } else {
                        # Check map collision
                        local mt: Tile = map.get(mx, my);
                        local mblocked: bool = false;
                        match (mt.kind) {
                            TileType.Wall => {
                                mblocked = true;
                            },
                            TileType.Door(open) => {
                                if (!open) 
                                    mblocked = true;
                            },
                            TileType.Floor => {
                                mblocked = false;
                            },
                        };
                        if (!mblocked) {
                            m.x = mx;
                            m.y = my;
                        }
                    }
                }
            }

            if (!player.is_alive()) {
                printf("\nGAME OVER!\n");
                running = false;
            }
        }
    }

    # Cleanup
    map.destroy();
    monsters.destroy();

    return 0;
}

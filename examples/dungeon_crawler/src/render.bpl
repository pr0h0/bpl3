export [Renderable];
export [Renderer];

import [Grid], [Tile], [TileType] from "./world.bpl";
import [Entity], [Player], [Monster] from "./entities.bpl";
import [Array] from "std/array.bpl";

extern printf(fmt: string, ...);

spec Renderable {
    frame render(this: Self);
}

struct Renderer {
    width: int,
    height: int,
    frame clear_screen(this: *Renderer) {
        printf("\u001b[2J\u001b[H");
    }

    frame draw_map(this: *Renderer, map: *Grid<Tile>) {
        loop (local y: int = 0; y < map.height; y = y + 1) {
            loop (local x: int = 0; x < map.width; x = x + 1) {
                local tile: Tile = map.get(x, y);

                # Simple visibility check (fog of war simulation)
                # In a real game, we'd check tile.visible

                match (tile.kind) {
                    TileType.Wall => printf("#"),
                    TileType.Floor => printf("."),
                    TileType.Door(open) => {
                        if (open) 
                            printf("'");
                        else 
                            printf("+");
                    },
                };
            }
            printf("\n");
        }
    }

    frame draw_entity(this: *Renderer, entity: *Entity) {
        # Move cursor to entity position
        # ANSI escape: \u001b[<line>;<col>H
        # Note: ANSI is 1-based
        printf("\u001b[%d;%dH", entity.y + 1, entity.x + 1);

        # Set color
        printf("\u001b[%dm", entity.color);

        # Draw symbol
        printf("%c", entity.symbol);

        # Reset color
        printf("\u001b[0m");
    }

    frame draw_ui(this: *Renderer, player: *Player) {
        printf("\u001b[%d;1H", this.height + 1);
        printf("HP: %d/%d  Lvl: %d  XP: %d\n", player.hp, player.max_hp, player.level, player.xp);
    }
}

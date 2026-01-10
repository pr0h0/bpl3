import [Entity], [EntityType] from "./entities.bpl";
import [Vec3] from "./math.bpl";

export [GameEngine];

/#
# Game Engine
The core system that manages the game loop and entity state.

## Usage
```bpl
local engine = GameEngine.new();
engine.start();
```
#/
struct GameEngine {
    isRunning: bool,
    tickRate: int,
    /#
    # Initialize Engine
    Creates a new game engine instance with default settings.
    #/
    frame new() ret GameEngine {
        local e: GameEngine;
        e.isRunning = false;
        e.tickRate = 60;
        return e;
    }

    /#
    # Start Game Loop
    Begins the main execution loop.
    
    This method will block until `stop()` is called.
    #/
    frame start(this: GameEngine) {
        this.isRunning = true;
        # loop { ... }
    }

    /#
    # Spawn Entity
    Creates a new entity in the world.

    ## Arguments
    - `kind`: The type of entity to spawn
    - `pos`: Initial position

    ## Returns
    The ID of the newly created entity.
    #/
    frame spawnEntity(this: GameEngine, kind: EntityType, pos: Vec3) ret int {
        # Implementation omitted
        this.tickRate = this.tickRate + cast<int>(pos.x);
        match (kind) {
            _ => {
            },
        };
        return 1;
    }
}

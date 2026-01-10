import [Vec2], [Vec3] from "./math.bpl";

export [EntityType];
export [Entity];

/#
# Entity Type Enum
Defines the category of a game entity.

## Variants
- `Player`: The main character
- `Enemy`: Hostile NPCs
- `Item`: Collectible objects
- `Scenery`: Static environment objects
#/
enum EntityType {
    Player,
    Enemy,
    Item,
    Scenery,
}

/#
# Game Entity
Base structure for all objects in the game world.

## Fields
- `id`: Unique identifier
- `position`: Current location in 3D space
- `kind`: The category of the entity
- `name`: Display name
#/
struct Entity {
    id: int,
    position: Vec3,
    kind: EntityType,
    name: string,
    /#
    # Move Entity
    Updates the entity's position by a delta vector.

    ## Arguments
    - `delta`: The movement vector to apply
    #/
    frame move(this: Entity, delta: Vec3) {
        this.position.x = this.position.x + delta.x;
        this.position.y = this.position.y + delta.y;
        this.position.z = this.position.z + delta.z;
    }
}

struct PlayerStats {
    health: int,
    mana: int,
    xp: int,
}

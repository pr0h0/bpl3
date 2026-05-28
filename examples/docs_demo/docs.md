# Module: math.bpl
*File: examples/docs_demo/math.bpl*

## Structs
### `Vec2`
#### Fields
```bpl
x: float
y: float
```


#### Methods
### `Vec2.new`
```bpl
frame new(x: float, y: float) ret Vec2
```


#### Constructor
Creates a new Vec2.

    ## Arguments
    - `x`: X coordinate
    - `y`: Y coordinate


### `Vec2.dot`
```bpl
frame dot(this: Vec2, other: Vec2) ret float
```


#### Dot Product
Calculates the dot product of this vector and another.

    ## Arguments
    - `other`: The other vector

    ## Returns
    The dot product (scalar)



### `Vec3`
#### Fields
```bpl
x: float
y: float
z: float
```


#### Methods
### `Vec3.magnitude`
```bpl
frame magnitude(this: Vec3) ret float
```


#### Magnitude
Calculates the length of the vector.




---

# Module: entities.bpl
*File: examples/docs_demo/entities.bpl*

## Enums
### `EntityType`


#### Entity Type Enum
Defines the category of a game entity.

#### Variants
- `Player`: The main character
- `Enemy`: Hostile NPCs
- `Item`: Collectible objects
- `Scenery`: Static environment objects

#### Variants
```bpl
Player
Enemy
Item
Scenery
```



## Structs
### `Entity`


#### Game Entity
Base structure for all objects in the game world.

#### Fields
- `id`: Unique identifier
- `position`: Current location in 3D space
- `kind`: The category of the entity
- `name`: Display name

#### Fields
```bpl
id: int
position: Vec3
kind: EntityType
name: string
```


#### Methods
### `Entity.move`
```bpl
frame move(this: Entity, delta: Vec3) ret void
```


#### Move Entity
Updates the entity's position by a delta vector.

    ## Arguments
    - `delta`: The movement vector to apply



### `PlayerStats`
#### Fields
```bpl
health: int
mana: int
xp: int
```




---

# Module: engine.bpl
*File: examples/docs_demo/engine.bpl*

## Structs
### `GameEngine`


#### Game Engine
The core system that manages the game loop and entity state.

#### Usage
```bpl
local engine: GameEngine = GameEngine.new();
engine.start();
```

#### Fields
```bpl
isRunning: bool
tickRate: int
```


#### Methods
### `GameEngine.new`
```bpl
frame new() ret GameEngine
```


#### Initialize Engine
Creates a new game engine instance with default settings.


### `GameEngine.start`
```bpl
frame start(this: GameEngine) ret void
```


#### Start Game Loop
Begins the main execution loop.
    
    This method will block until `stop()` is called.


### `GameEngine.spawnEntity`
```bpl
frame spawnEntity(this: GameEngine, kind: EntityType, pos: Vec3) ret int
```


#### Spawn Entity
Creates a new entity in the world.

    ## Arguments
    - `kind`: The type of entity to spawn
    - `pos`: Initial position

    ## Returns
    The ID of the newly created entity.




---

# Module: main.bpl
*File: examples/docs_demo/main.bpl*

## Global Variables
### `MAX_ENTITIES`
```bpl
global MAX_ENTITIES: int
```


## Functions
### `main`
```bpl
frame main() ret int
```


#### Main Entry Point
Initializes the game engine and starts the simulation.

#### Process
1. Create Engine
2. Spawn Player
3. Start Loop



---

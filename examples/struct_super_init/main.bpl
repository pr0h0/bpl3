extern printf(fmt: string, ...);

struct Entity {
    id: int,
    frame initialize(this: *Entity, id: int) {
        this.id = id;
        printf("Entity initialized with ID: %d\n", this.id);
    }
}

struct Player: Entity {
    name: string,
    frame initialize(this: *Player, id: int, name: string) {
        # Call parent initialize explicitly (super call)
        # We pass 'this' which is *Player, but it's compatible with *Entity
        Entity.initialize(this, id);

        this.name = name;
        printf("Player initialized with name: %s\n", this.name);
    }
}

frame main() ret int {
    local p: Player;

    # Initialize the player, which chains to Entity.initialize
    p.initialize(42, "Hero");

    printf("Final State -> ID: %d, Name: %s\n", p.id, p.name);
    return 0;
}

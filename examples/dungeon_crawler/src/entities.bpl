export [Entity];
export [Actor];
export [Player];
export [Monster];
export [MonsterType];

import [TileType] from "./world.bpl";

struct Entity {
    x: int,
    y: int,
    symbol: char,
    color: int,
    name: string,
    # ANSI color code

    frame new(x: int, y: int, symbol: char, name: string) ret Entity {
        local e: Entity;
        e.x = x;
        e.y = y;
        e.symbol = symbol;
        e.name = name;
        e.color = 37; # White
        return e;
    }
}

struct Actor: Entity {
    hp: int,
    max_hp: int,
    attack: int,
    defense: int,
    frame is_alive(this: *Actor) ret bool {
        return this.hp > 0;
    }

    frame take_damage(this: *Actor, amount: int) {
        this.hp = this.hp - amount;
        if (this.hp < 0) {
            this.hp = 0;
        }
    }
}

struct Player: Actor {
    xp: int,
    level: int,
    frame new(x: int, y: int) ret Player {
        local p: Player;
        # Initialize Entity fields
        p.x = x;
        p.y = y;
        p.symbol = '@';
        p.name = "Hero";
        p.color = 33; # Yellow

        # Initialize Actor fields
        p.hp = 100;
        p.max_hp = 100;
        p.attack = 10;
        p.defense = 2;

        # Initialize Player fields
        p.xp = 0;
        p.level = 1;

        return p;
    }
}

enum MonsterType {
    Goblin,
    Orc,
    Troll,
}

struct Monster: Actor {
    kind: MonsterType,
    frame new(x: int, y: int, kind: MonsterType) ret Monster {
        local m: Monster;
        m.x = x;
        m.y = y;
        m.kind = kind;

        match (kind) {
            MonsterType.Goblin => {
                m.symbol = 'g';
                m.name = "Goblin";
                m.hp = 20;
                m.max_hp = 20;
                m.attack = 4;
                m.color = 32; # Green
            },
            MonsterType.Orc => {
                m.symbol = 'o';
                m.name = "Orc";
                m.hp = 40;
                m.max_hp = 40;
                m.attack = 8;
                m.color = 31; # Red
            },
            MonsterType.Troll => {
                m.symbol = 'T';
                m.name = "Troll";
                m.hp = 100;
                m.max_hp = 100;
                m.attack = 15;
                m.color = 35; # Magenta
            },
        };
        m.defense = 0;
        return m;
    }
}

import printf from "libc";

struct Entity {
    id: i32,

    frame initEntity(id: i32) {
        this.id = id;
    }

    frame describe() {
        call printf("Entity(id=%d)\n", this.id);
    }
}

struct Player: Entity {
    level: i32,

    frame initPlayer(id: i32, level: i32) {
        this.id = id;
        this.level = level;
    }

    frame describe() {
        # Override

        call printf("Player(id=%d, level=%d)\n", this.id, this.level);
    }

    frame levelUp() {
        this.level = this.level + 1;
        call printf("Player leveled up to %d\n", this.level);
    }
}

struct SuperPlayer: Player {
    power: i32,

    frame initSuper(id: i32, level: i32, power: i32) {
        this.id = id;
        this.level = level;
        this.power = power;
    }

    frame describe() {
        # Override

        call printf("SuperPlayer(id=%d, level=%d, power=%d)\n", this.id, this.level, this.power);
    }

    frame usePower() {
        call printf("SuperPlayer uses power %d!\n", this.power);
    }
}

frame main() {
    local e: Entity;
    call e.initEntity(1);
    call e.describe();

    local p: Player;
    call p.initPlayer(2, 10);
    call p.describe();
    call p.levelUp();

    local s: SuperPlayer;
    call s.initSuper(3, 99, 9000);
    call s.describe();
    call s.levelUp(); # Inherited from Player
    call s.usePower();
}

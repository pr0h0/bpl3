extern printf(fmt: string, ...);
# Test multi-level inheritance
struct Entity {
    id: int,
    active: int,
}
struct LivingEntity : Entity {
    health: int,
    max_health: int,
}
struct Character : LivingEntity {
    name: string,
    level: int,
}
struct Enemy : Character {
    damage: int,
    aggressive: int,
}
frame print_entity(e: Entity) {
    printf("Entity ID: %d, Active: %d\n", e.id, e.active);
}
frame print_living(l: LivingEntity) {
    printf("Living - ID: %d, Health: %d/%d\n", l.id, l.health, l.max_health);
}
frame print_character(c: Character) {
    printf("Character - %s, Level %d, Health: %d\n", c.name, c.level, c.health);
}
frame print_enemy(e: Enemy) {
    printf("Enemy - %s (Lv%d), HP:%d, DMG:%d, Aggressive:%d\n", e.name, e.level, e.health, e.damage, e.aggressive);
}
frame main() ret int {
    printf("=== Multi-Level Inheritance Test ===\n");
    # Create an enemy with all inherited fields
    local boss: Enemy;
    boss.id = 100;
    boss.active = 1;
    boss.health = 500;
    boss.max_health = 500;
    boss.name = "Dragon";
    boss.level = 10;
    boss.damage = 50;
    boss.aggressive = 1;
    # Test accessing inherited fields directly
    printf("\nAccessing inherited fields:\n");
    printf("Base fields - ID: %d, Active: %d\n", boss.id, boss.active);
    printf("Living fields - Health: %d/%d\n", boss.health, boss.max_health);
    printf("Character fields - Name: %s, Level: %d\n", boss.name, boss.level);
    printf("Enemy fields - Damage: %d, Aggressive: %d\n", boss.damage, boss.aggressive);
    print_enemy(boss);
    # Modify inherited fields
    boss.health = 250;
    boss.active = 0;
    printf("\nAfter modifications:\n");
    print_enemy(boss);
    return 0;
}

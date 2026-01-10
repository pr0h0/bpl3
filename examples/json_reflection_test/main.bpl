import [JSON] from "std/json.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;
extern malloc(size: long) ret string;

enum Status {
    Inactive,
    Active,
    Banned,
}

struct User {
    id: int,
    name: string,
    active: bool,
    # score: float, 
    roles: int[3],
    status: Status,
}

struct Group {
    id: int,
    admin: *User,
    member: User,
}

frame main() {
    local u: User;
    u.id = 1;
    u.name = "Alice";
    u.active = true;
    u.roles[0] = 10;
    u.roles[1] = 20;
    u.roles[2] = 30;
    u.status = Status.Active;

    local s1: String = JSON.stringify<User>(&u);
    printf("User: %s\n", s1.toString());

    # Test Parse
    local u2: *User = JSON.parse<User>(s1.toString());
    local s1_parsed: String = JSON.stringify<User>(u2);
    printf("User Parsed: %s\n", s1_parsed.toString());
    s1_parsed.destroy();

    s1.destroy();

    local g: Group;
    g.id = 100;
    g.admin = &u;
    g.member = u;
    g.member.id = 2;
    g.member.name = "Bob";

    local s2: String = JSON.stringify<Group>(&g);
    printf("Group: %s\n", s2.toString());
    s2.destroy();
}

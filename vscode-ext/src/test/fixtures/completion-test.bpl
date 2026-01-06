import sprintf, printf, atoi, strcpy, strcat, strlen, strcmp from "bpl-express";
import [App], [Router], [Request], [Response] from "bpl-express";

struct User {
    id: int,
    name: string,
    email: string,
    frame new() ret User {
        local u: User = 0;
        u.id = 0;
        u.name = "Default Name";
        u.email = "default@example.com";
        return u;
    }
    frame getName(this: *User) ret string {
        return this.name;
    }

    frame getEmail(this: *User) ret string {
        return this.email;
    }

    frame setName(this: *User, newName: string) {
        this.name = newName;
    }

    frame getAge(this: *User) ret int {
        return 0;
    }
}

enum Status {
    Active,
    Inactive,
    Pending,
}

frame testCompletions() {
    local user: User = User.new();
    local status: Status = Status.Active;
    local app: App = App.new();
    local router: Router = Router.new();

    # Line 44: completion test point for user
    local userName: string = user.getName();

    # Line 47: partial completion test point user.getNa
    local partialTest: string = user.getName();

    # Line 50: completion test point for status
    local currentStatus: Status = status;

    # Line 53: completion test point for app.router
    local appRouter: Router = app.router;

    # Line 56: imported function test
    local len: int = strlen("test");
    local formatted: int = sprintf("test", "test");

    loop (local i: int = 0; i < 10; i = i + 1) {
        local loopVar: User = User.new();
        # Line 62: completion test point for loopVar
        local loopName: string = loopVar.getName();
    }
}

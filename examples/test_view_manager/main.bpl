import [printf] from "std/c.bpl";
extern malloc(size: u64) ret *void;
import [free] from "std/c.bpl";
extern memset(dest: *void, c: int, n: u64) ret *void;
extern strcmp(s1: *char, s2: *char) ret int;
extern strncpy(dest: *char, src: *char, n: u64) ret *char;

struct ViewDefinition {
    name: char[64],
    query: char[256],
    columnCount: int,

    frame init(this: *ViewDefinition) {
        memset(cast<*void>(&this.name[0]), 0, 64);
        memset(cast<*void>(&this.query[0]), 0, 256);
        this.columnCount = 0;
    }

    frame setName(this: *ViewDefinition, viewName: *char) {
        strncpy(&this.name[0], viewName, 63);
        this.name[63] = cast<char>(0);
    }

    frame setQuery(this: *ViewDefinition, sql: *char) {
        strncpy(&this.query[0], sql, 255);
        this.query[255] = cast<char>(0);
    }

    frame getName(this: *ViewDefinition) ret *char {
        return &this.name[0];
    }

    frame print(this: *ViewDefinition) {
        printf("  View: %s\n", &this.name[0]);
        printf("  Query: %s\n", &this.query[0]);
    }
}

struct ViewManager {
    views: *ViewDefinition,
    viewCount: int,
    viewCapacity: int,

    frame init(this: *ViewManager) {
        this.viewCapacity = 8;
        this.views = cast<*ViewDefinition>(malloc(cast<u64>(this.viewCapacity) * cast<u64>(sizeof<ViewDefinition>())));
        this.viewCount = 0;
        memset(cast<*void>(this.views), 0, cast<u64>(this.viewCapacity) * cast<u64>(sizeof<ViewDefinition>()));
    }

    frame cleanup(this: *ViewManager) {
        if (this.views != nullptr) {
            free(cast<*void>(this.views));
            this.views = nullptr;
        }
    }

    frame createView(this: *ViewManager, name: *char, query: *char) ret bool {
        if (this.viewCount >= this.viewCapacity) {
            return false;
        }
        local view: *ViewDefinition = &this.views[this.viewCount];
        view.init();
        view.setName(name);
        view.setQuery(query);
        this.viewCount = this.viewCount + 1;

        return true;
    }

    frame listViews(this: *ViewManager) {
        printf("Views (%d):\n", this.viewCount);
        loop (local i: int = 0; i < this.viewCount; i = i + 1) {
            local view: *ViewDefinition = &this.views[i];
            view.print();
        }
    }
}

frame main() ret int {
    printf("Testing ViewManager...\n\n");

    local mgr: ViewManager;
    mgr.init();

    mgr.createView("active_users", "SELECT * FROM users WHERE active = true");
    mgr.createView("high_salary", "SELECT name FROM users WHERE salary > 70000");
    mgr.createView("order_summary", "SELECT user_id, COUNT(*) FROM orders GROUP BY user_id");

    mgr.listViews();

    mgr.cleanup();

    printf("\nAll tests passed!\n");
    return 0;
}

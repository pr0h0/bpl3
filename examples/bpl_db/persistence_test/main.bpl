import [Engine] from "../src/engine.bpl";
import [Database] from "../src/storage.bpl";
import [Query], [Command], [Condition], [Operator] from "../src/query.bpl";
import [Value] from "../src/types.bpl";
import [Array] from "std/array.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    printf("=== BPL DB Persistence Test ===\n");

    local engine: Engine = Engine.new();
    engine.silent = false;

    # 1. Create Table and Insert Data
    printf("\n--- Creating Data ---\n");
    local cols: Array<string> = Array<string>.new(2);
    cols.push("name");
    cols.push("score");

    local q_create: Query;
    q_create.command = Command.Create("players", &cols);
    engine.execute(&q_create);

    local vals1: Array<Value> = Array<Value>.new(2);
    vals1.push(Value.Str("Alice"));
    vals1.push(Value.Int(100));
    local q_insert1: Query;
    q_insert1.command = Command.Insert("players", &vals1);
    engine.execute(&q_insert1);

    local vals2: Array<Value> = Array<Value>.new(2);
    vals2.push(Value.Str("Bob"));
    vals2.push(Value.Int(200));
    local q_insert2: Query;
    q_insert2.command = Command.Insert("players", &vals2);
    engine.execute(&q_insert2);

    # 2. Save to File
    printf("\n--- Saving to 'db.dump' ---\n");
    engine.db.save("db.dump");

    # 3. Load from File into New Engine
    printf("\n--- Loading from 'db.dump' ---\n");
    local engine2: Engine = Engine.new();
    engine2.silent = false;
    engine2.db.load("db.dump");

    # 4. Verify Data
    printf("\n--- Verifying Loaded Data ---\n");
    local conds: Array<Condition> = Array<Condition>.new(0);
    local q_select: Query;
    q_select.command = Command.Select("players", &conds);
    engine2.execute(&q_select);

    return 0;
}

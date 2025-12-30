import [Engine] from "./src/engine.bpl";
import [Database] from "./src/storage.bpl";
import [Query], [Command], [Condition], [Operator] from "./src/query.bpl";
import [Value] from "./src/types.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...);

frame main() ret int {
    printf("=== BPL DB Example ===\n");

    local engine: Engine = Engine.new();

    # 1. Create Table 'users' (age, score)
    # Note: ID is auto-generated
    printf("\n--- Creating Table ---\n");
    local cols: Array<string> = Array<string>.new(2);
    cols.push("age");
    cols.push("score");

    local q_create: Query;
    q_create.command = Command.Create("users", &cols);
    engine.execute(&q_create);

    # 2. Insert Data
    printf("\n--- Inserting Data ---\n");

    # User 1: Age 25, Score 100
    local vals1: Array<Value> = Array<Value>.new(2);
    vals1.push(Value.Int(25));
    vals1.push(Value.Int(100));
    local q_insert1: Query;
    q_insert1.command = Command.Insert("users", &vals1);
    engine.execute(&q_insert1);

    # User 2: Age 30, Score 200
    local vals2: Array<Value> = Array<Value>.new(2);
    vals2.push(Value.Int(30));
    vals2.push(Value.Int(200));
    local q_insert2: Query;
    q_insert2.command = Command.Insert("users", &vals2);
    engine.execute(&q_insert2);

    # User 3: Age 20, Score 50
    local vals3: Array<Value> = Array<Value>.new(2);
    vals3.push(Value.Int(20));
    vals3.push(Value.Int(50));
    local q_insert3: Query;
    q_insert3.command = Command.Insert("users", &vals3);
    engine.execute(&q_insert3);

    # 3. Select All
    printf("\n--- Select All ---\n");
    local conds_all: Array<Condition> = Array<Condition>.new(0);
    local q_select_all: Query;
    q_select_all.command = Command.Select("users", &conds_all);
    engine.execute(&q_select_all);

    # 4. Select Where Age > 22
    printf("\n--- Select Where age > 22 ---\n");
    local conds_filter: Array<Condition> = Array<Condition>.new(1);
    local c1: Condition;
    c1.column = "age";
    c1.op = Operator.Gt;
    c1.value = Value.Int(22);
    conds_filter.push(c1);

    local q_select_filter: Query;
    q_select_filter.command = Command.Select("users", &conds_filter);
    engine.execute(&q_select_filter);

    # 5. Update: Set score = 999 Where age == 20
    printf("\n--- Update score = 999 Where age == 20 ---\n");
    local conds_update: Array<Condition> = Array<Condition>.new(1);
    local c2: Condition;
    c2.column = "age";
    c2.op = Operator.Eq;
    c2.value = Value.Int(20);
    conds_update.push(c2);

    local q_update: Query;
    q_update.command = Command.Update("users", &conds_update, "score", Value.Int(999));
    engine.execute(&q_update);

    # Verify Update
    engine.execute(&q_select_all);

    # 6. Delete Where score > 150
    printf("\n--- Delete Where score > 150 ---\n");
    local conds_delete: Array<Condition> = Array<Condition>.new(1);
    local c3: Condition;
    c3.column = "score";
    c3.op = Operator.Gt;
    c3.value = Value.Int(150);
    conds_delete.push(c3);

    local q_delete: Query;
    q_delete.command = Command.Delete("users", &conds_delete);
    engine.execute(&q_delete);

    # Final Select
    printf("\n--- Final Result ---\n");
    engine.execute(&q_select_all);

    # 7. Persistence Test
    printf("\n--- Persistence Test ---\n");
    printf("Saving to 'db_main.dump'...\n");
    engine.db.save("db_main.dump");

    printf("Loading into new engine...\n");
    local engine2: Engine = Engine.new();
    engine2.db.load("db_main.dump");

    printf("Verifying loaded data:\n");
    engine2.execute(&q_select_all);

    return 0;
}

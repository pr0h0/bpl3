import [Engine], [Query], [Command], [Value], [Condition], [Operator] from "bpl-db";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...);

frame main() ret int {
    printf("=== DB Client Example ===\n");

    # Initialize Engine
    local engine: Engine = Engine.new();
    engine.silent = false;

    # Create Table
    printf("Creating table 'products'...\n");
    local cols: Array<string> = Array<string>.new(2);
    cols.push("name");
    cols.push("price");

    local q_create: Query;
    q_create.command = Command.Create("products", &cols);
    engine.execute(&q_create);

    # Insert Data
    printf("Inserting data...\n");
    local vals: Array<Value> = Array<Value>.new(2);
    vals.push(Value.Str("Laptop"));
    vals.push(Value.Int(999));

    local q_insert: Query;
    q_insert.command = Command.Insert("products", &vals);
    engine.execute(&q_insert);

    # Query Data
    printf("Querying data...\n");
    local conds: Array<Condition> = Array<Condition>.new(0);
    local q_select: Query;
    q_select.command = Command.Select("products", &conds);
    engine.execute(&q_select);

    return 0;
}

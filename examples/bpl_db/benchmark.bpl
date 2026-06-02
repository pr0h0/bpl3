import [Engine] from "./src/engine.bpl";
import [Query], [Command], [Condition], [Operator] from "./src/query.bpl";
import [Value] from "./src/types.bpl";
import [Array] from "std/array.bpl";

import [printf] from "std/c.bpl";
extern gettimeofday(tv: *TimeVal, tz: *void) ret int;

struct TimeVal {
    tv_sec: long,
    tv_usec: long,
}

frame get_time_us() ret long {
    local tv: TimeVal;
    gettimeofday(&tv, nullptr);
    return (tv.tv_sec * 1000000) + tv.tv_usec;
}

frame main() ret int {
    printf("=== BPL DB Benchmark ===\n");

    local engine: Engine = Engine.new();
    engine.silent = true;

    # Create Table
    local cols: Array<string> = Array<string>.new(2);
    cols.push("val1");
    cols.push("val2");

    local q_create: Query;
    q_create.command = Command.Create("bench", &cols);
    engine.execute(&q_create);

    # Benchmark Insert
    local N: int = 10000;
    printf("Inserting %d rows...\n", N);
    local start_time: long = get_time_us();

    local vals: Array<Value> = Array<Value>.new(2);
    vals.push(Value.Int(0));
    vals.push(Value.Int(0));

    local q_insert: Query;
    q_insert.command = Command.Insert("bench", &vals);

    loop (local i: int = 0; i < N; i = i + 1) {
        # Update values in the array
        vals.set(0, Value.Int(i));
        vals.set(1, Value.Int(i * 2));

        # Execute
        engine.execute(&q_insert);
    }

    local end_time: long = get_time_us();
    local diff: long = end_time - start_time;
    printf("Insert Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Select
    printf("Selecting all rows...\n");
    start_time = get_time_us();

    local empty_conds: Array<Condition> = Array<Condition>.new(0);
    local q_select: Query;
    q_select.command = Command.Select("bench", &empty_conds);
    engine.execute(&q_select);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Select Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Eq
    printf("Selecting where val1 == 5000...\n");
    start_time = get_time_us();

    local conds_eq: Array<Condition> = Array<Condition>.new(1);
    local c_eq: Condition;
    c_eq.column = "val1";
    c_eq.op = Operator.Eq;
    c_eq.value = Value.Int(5000);
    conds_eq.push(c_eq);

    q_select.command = Command.Select("bench", &conds_eq);
    engine.execute(&q_select);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Select Eq Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Gt
    printf("Selecting where val1 > 9000...\n");
    start_time = get_time_us();

    local conds_gt: Array<Condition> = Array<Condition>.new(1);
    local c_gt: Condition;
    c_gt.column = "val1";
    c_gt.op = Operator.Gt;
    c_gt.value = Value.Int(9000);
    conds_gt.push(c_gt);

    q_select.command = Command.Select("bench", &conds_gt);
    engine.execute(&q_select);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Select Gt Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Gte
    printf("Selecting where val1 >= 9000...\n");
    start_time = get_time_us();

    local conds_gte: Array<Condition> = Array<Condition>.new(1);
    local c_gte: Condition;
    c_gte.column = "val1";
    c_gte.op = Operator.Gte;
    c_gte.value = Value.Int(9000);
    conds_gte.push(c_gte);

    q_select.command = Command.Select("bench", &conds_gte);
    engine.execute(&q_select);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Select Gte Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Lt
    printf("Selecting where val1 < 1000...\n");
    start_time = get_time_us();

    local conds_lt: Array<Condition> = Array<Condition>.new(1);
    local c_lt: Condition;
    c_lt.column = "val1";
    c_lt.op = Operator.Lt;
    c_lt.value = Value.Int(1000);
    conds_lt.push(c_lt);

    q_select.command = Command.Select("bench", &conds_lt);
    engine.execute(&q_select);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Select Lt Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Lte
    printf("Selecting where val1 <= 1000...\n");
    start_time = get_time_us();

    local conds_lte: Array<Condition> = Array<Condition>.new(1);
    local c_lte: Condition;
    c_lte.column = "val1";
    c_lte.op = Operator.Lte;
    c_lte.value = Value.Int(1000);
    conds_lte.push(c_lte);

    q_select.command = Command.Select("bench", &conds_lte);
    engine.execute(&q_select);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Select Lte Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Update
    printf("Updating val2 = 9999 where val1 < 5000...\n");
    start_time = get_time_us();

    local conds_update: Array<Condition> = Array<Condition>.new(1);
    local c_update: Condition;
    c_update.column = "val1";
    c_update.op = Operator.Lt;
    c_update.value = Value.Int(5000);
    conds_update.push(c_update);

    local q_update: Query;
    q_update.command = Command.Update("bench", &conds_update, "val2", Value.Int(9999));
    engine.execute(&q_update);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Update Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    # Benchmark Delete
    printf("Deleting where val1 >= 5000...\n");
    start_time = get_time_us();

    local conds_delete: Array<Condition> = Array<Condition>.new(1);
    local c_delete: Condition;
    c_delete.column = "val1";
    c_delete.op = Operator.Gte;
    c_delete.value = Value.Int(5000);
    conds_delete.push(c_delete);

    local q_delete: Query;
    q_delete.command = Command.Delete("bench", &conds_delete);
    engine.execute(&q_delete);

    end_time = get_time_us();
    diff = end_time - start_time;
    printf("Delete Time: %ld us (%.2f ms)\n", diff, cast<float>(diff) / 1000.0);

    return 0;
}

export [Query];
export [Command];
export [Condition];
export [Operator];

import [Value] from "./types.bpl";
import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";

enum Operator {
    Eq,
    Neq,
    Gt,
    Lt,
    Gte,
    Lte,
}

struct Condition {
    column: string,
    op: Operator,
    value: Value,
}

enum Command {
    Select(string, *Array<Condition>), # Table name, Conditions
    Insert(string, *Array<Value>), # Table name, Values
    Create(string, *Array<string>), # Table name, Columns
    Update(string, *Array<Condition>, string, Value), # Table, Where, ColName, NewVal
    Delete(string, *Array<Condition>), # Table, Where
}

struct Query {
    command: Command,
}

# Simplified Parser (Mock)
# In a real DB, this would parse SQL string
frame parse_query(sql: string) ret Query {
    # Mock implementation returning a hardcoded query for testing
    # Real parsing is complex
    # Use sql to avoid unused variable warning
    if (sql == "") {
        # do nothing
    }
    local q: Query;
    # q.command = Command.Select("users", Array<Condition>.new(0));
    return q;
}

import [JSON], [Jsonable], [JsonToResult], [JsonParseResult] from "std/json.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

struct User: Jsonable {
    id: int,
    name: string,

    # Custom serialization hook detected by reflection
    frame toJson(this: *User) ret JsonToResult {
        return JsonToResult.Result("\"CustomJSON-User\"");
    }

    frame fromJson(json: string, dest: *User) ret JsonParseResult {
        if (json[0] == cast<char>(34)) {
            # "CustomJSON-User"
            dest.id = 999;
            dest.name = "ParsedUser";
            return JsonParseResult.Success;
        }
        return JsonParseResult.Default;
    }
}

frame main() {
    local u: User;
    u.id = 1;
    u.name = "Alice";

    # The JSON serializer checks for a 'toJson' method and uses it if present
    local sStruct: String = JSON.stringify<User>(&u);
    local s: string = sStruct.toString();

    IO.print("Result: ");
    IO.print(s);
    IO.print("\n");

    # Test fromJson
    local jsonStr: string = "\"CustomJSON-User\"";
    local u2: *User = JSON.parse<User>(jsonStr);

    if (u2 != nullptr) {
        IO.print("Parsed ID: ");
        IO.printInt(u2.id);
        IO.print("\n");
        IO.print("Parsed Name: ");
        IO.print(u2.name);
        IO.print("\n");
    }
}

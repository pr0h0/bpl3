import [JSON] from "std/json.bpl";
import [FS] from "std/fs.bpl";
import [String] from "std/string.bpl";
import [IO] from "std/io.bpl";

struct Config {
    id: int,
    username: string,
    active: bool,
}

frame main() {
    # 1. Create Object
    local cfg: Config;
    cfg.id = 101;
    cfg.username = "bpl_user";
    cfg.active = true;

    IO.print("Original Config:\n");
    IO.print("  ID: ");
    IO.printInt(cfg.id);
    IO.print("\n");
    IO.print("  User: ");
    IO.print(cfg.username);
    IO.print("\n");

    # 2. Serialize
    local jsonStrObj: String = JSON.stringify<Config>(&cfg);
    local jsonStr: string = jsonStrObj.toString();

    IO.print("Serialized JSON:\n");
    IO.print(jsonStr);
    IO.print("\n");

    # 3. Write to File
    local path: string = "config.json";
    if (FS.writeFile(path, jsonStr)) {
        IO.print("Successfully wrote to file: ");
        IO.print(path);
        IO.print("\n");
    } else {
        IO.print("Failed to write to file.\n");
        return;
    }

    # 4. Read from File
    local readStrObj: String = FS.readFile(path);
    local readStr: string = readStrObj.toString();

    IO.print("Read JSON from file:\n");
    IO.print(readStr);
    IO.print("\n");

    # 5. Deserialize
    local loadedCfgPtr: *Config = JSON.parse<Config>(readStr);

    IO.print("Restored Config:\n");
    IO.print("  ID: ");
    IO.printInt(loadedCfgPtr.id);
    IO.print("\n");
    IO.print("  User: ");
    IO.print(loadedCfgPtr.username);
    IO.print("\n");

    if (loadedCfgPtr.active) {
        IO.print("  Active: true\n");
    } else {
        IO.print("  Active: false\n");
    }
}

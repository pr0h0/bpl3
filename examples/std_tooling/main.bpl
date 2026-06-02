import [Args], [JSON], [Log], [String] from "std";

import [printf] from "std/c.bpl";

frame main(argc: int, argv: **char) ret int {
    local args: Args = Args.new(argc, argv);
    local value: int = 42;
    local encoded: String = JSON.stringify<int>(&value);

    printf("argc: %d\n", args.count());
    printf("json: %s\n", encoded.data);
    Log.info("log: ready");

    encoded.destroy();
    return 0;
}


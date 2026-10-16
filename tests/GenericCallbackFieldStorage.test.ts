import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("resolved generic field metadata preserves callable alias storage", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `import [Array] from "std/array.bpl";
 type Callback=Func<int>(int);type Callbacks=Array<Callback>;struct Handlers{values:Array<Callback>}struct AliasedHandlers{values:Callbacks}
 frame increment(value:int)ret int{return value+1;}
 frame main()ret int{local handlers:Handlers;handlers.values=Array<Callback>.new(1);
 handlers.values.push(increment);local callback:Callback=handlers.values.get(0);
 local result:int=callback(41);handlers.values.destroy();if(result!=42){return 1;}
 local aliased:AliasedHandlers;aliased.values=Array<Callback>.new(1);aliased.values.push(increment);
 callback=aliased.values.get(0);result=callback(41);aliased.values.destroy();if(result!=42){return 2;}return 0;}`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);

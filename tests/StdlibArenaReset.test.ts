import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("arena reset reuses standard and dedicated large blocks across repeated cycles", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `import [ArenaAllocator] from "std/memory/arena_allocator.bpl";
 frame main()ret int{
  local arena:ArenaAllocator;arena.init(4096);
  local pointers:*void[3];loop(local i:int=0;i<3;i=i+1){pointers[i]=arena.alloc(4000);if(pointers[i]==nullptr){return 1;}}
  loop(local cycle:int=0;cycle<100;cycle=cycle+1){
   arena.reset();
   loop(local i:int=0;i<3;i=i+1){local p:*void=arena.alloc(4000);if(p!=pointers[i]){return 2;}*cast<*u8>(p)=cast<u8>(cycle);}
  }
  arena.destroy();arena.init(4096);
  local large:*void=arena.alloc(16384);if(large==nullptr){return 3;}
  loop(local cycle:int=0;cycle<100;cycle=cycle+1){arena.reset();if(arena.alloc(16384)!=large){return 4;}}
  arena.destroy();arena.destroy();return 0;
 }`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);

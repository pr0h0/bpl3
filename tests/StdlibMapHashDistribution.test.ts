import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("default Map hashing distributes strided integers and pointer keys", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `import [Map] from "std/map.bpl";
 frame occupied<K,V>(m:*Map<K,V>)ret int{local count:int=0;loop(local i:int=0;i<m.buckets.len();i=i+1){if(m.buckets.get(i)!=nullptr){count=count+1;}}return count;}
 frame main()ret int{
  local m:Map<u64,int>=Map<u64,int>.new();m.reserve(2000);
  loop(local i:int=0;i<2000;i=i+1){m.set(cast<u64>(i)*65536,i);}
  if(occupied<u64,int>(&m)<1000){return 1;}
  loop(local i:int=0;i<2000;i=i+1){if(m.get(cast<u64>(i)*65536).unwrap()!=i){return 2;}}
  m.reserve(8000);
  loop(local i:int=0;i<2000;i=i+1){if(m.get(cast<u64>(i)*65536).unwrap()!=i){return 3;}}m.destroy();
  local values:int[2000];local pointers:Map<*int,int>=Map<*int,int>.new();pointers.reserve(2000);
  loop(local i:int=0;i<2000;i=i+1){pointers.set(&values[i],i);}
  if(occupied<*int,int>(&pointers)<1000){return 4;}
  loop(local i:int=0;i<2000;i=i+1){if(pointers.get(&values[i]).unwrap()!=i){return 5;}}pointers.destroy();return 0;
 }`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);

import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("manual allocators reject wrapped sizes and preserve allocation state", () => {
  expectCorrectnessSuite([
    {
      name: "allocator-size-and-lifecycle",
      validateLlvm: true,
      expectedStdout: "",
      source: `import [ArenaAllocator] from "std/memory/arena_allocator.bpl";
import [StackAllocator] from "std/memory/stack_allocator.bpl";
import [PoolAllocator] from "std/memory/pool_allocator.bpl";
frame main() ret int {
 local max:ulong=cast<ulong>(0xffffffffffffffff);
 local arena:ArenaAllocator;arena.init(4096);
 local stack:StackAllocator;stack.init(4096);
 local a:*u8=cast<*u8>(arena.alloc(8));
 local s:*u8=cast<*u8>(stack.alloc(8));
 if(a==nullptr || s==nullptr) {return 1;}
 *a=cast<u8>(42);*s=cast<u8>(43);
 loop(local i:ulong=0;i<8;i+=1) {
  if(arena.alloc(max-i)!=nullptr || stack.alloc(max-i)!=nullptr) {return 2;}
 }
 if(arena.alloc_large(max)!=nullptr || arena.grow_and_alloc(max)!=nullptr) {return 3;}
 if(arena.alloc(0)!=nullptr || stack.alloc(0)!=nullptr) {return 4;}
 if(stack.get_marker()!=8 || *a!=42 || *s!=43) {return 5;}
 local nextA:*u8=cast<*u8>(arena.alloc(8));
 local nextS:*u8=cast<*u8>(stack.alloc(8));
 if(nextA==a || nextS==s) {return 6;}
 local caught:int=0;
 try {stack.free_to_marker(4096);} catch(e:string) {if(e!=nullptr)caught+=1;}
 try {stack.free_to_marker(1);} catch(e:string) {if(e!=nullptr)caught+=1;}
 if(caught!=2 || stack.get_marker()!=16) {return 7;}
 stack.free_to_marker(8);
 if(stack.alloc(8)!=cast<*void>(nextS)) {return 8;}
 if(stack.alloc(4080)==nullptr || stack.alloc(1)!=nullptr) {return 9;}
 stack.destroy();stack.destroy();arena.destroy();arena.destroy();
 stack.init(max);if(stack.alloc(8)!=nullptr || stack.capacity!=0) {return 10;}
 arena.init(max);if(arena.alloc(8)!=nullptr) {return 11;}arena.destroy();
 local pool:PoolAllocator;pool.init(max);
 if(pool.alloc(0)!=nullptr || pool.alloc(8)!=nullptr) {return 12;}
 pool.destroy();pool.init(32);
 local first:*u8=cast<*u8>(pool.alloc(32));
 local second:*u8=cast<*u8>(pool.alloc(32));
 if(first==nullptr || second==nullptr || first==second) {return 13;}
 *second=cast<u8>(99);pool.free(first);
 if(pool.alloc(32)!=cast<*void>(first) || *second!=99) {return 14;}
 pool.destroy();pool.destroy();
 if(pool.free_head!=nullptr || pool.chunk_head!=nullptr) {return 15;}
 local reused:*void=pool.alloc(32);if(reused==nullptr) {return 16;}
 pool.destroy();return 0;
}`,
    },
  ]);
}, 60000);

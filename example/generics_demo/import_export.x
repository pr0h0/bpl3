import [Box], [Pair] from "./imported_generics.x";

global b: Box<u64>;
global p: Pair<u8, u64>;
global nested: Box<Pair<u64, u8>>;

frame process(_p: Pair<u64, u8>) {

}

export process;

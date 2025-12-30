# Iterator Specifications

export [Iterator];
export [Iterable];

import [Option] from "std/option.bpl";

/#
    Iterator<T>
    An object that can traverse a collection.
#/
spec Iterator<T> {
    frame next(this: *Self) ret Option<T>;
}

/#
    Iterable<T>
    A collection that can provide an iterator.
#/
spec Iterable<T> {
    frame iterator(this: *Self) ret Iterator<T>;
}

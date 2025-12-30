# Core Specifications (Interfaces) without dependencies

export [Comparable];
export [Equatable];
export [Destructible];
export [Cloneable];

/#
    # Equatable<T>
    # Types that can be compared for equality.
#/
spec Equatable<T> {
    frame __eq__(this: *T, other: *T) ret bool;
    frame __ne__(this: *T, other: *T) ret bool;
}

/#
    Comparable<T>
    Types that can be compared for ordering.
    Implies Equatable<T>.
#/
spec Comparable<T>: Equatable<T> {
    frame __lt__(this: *T, other: *T) ret bool;
    frame __gt__(this: *T, other: *T) ret bool;
    frame __le__(this: *T, other: *T) ret bool;
    frame __ge__(this: *T, other: *T) ret bool;
}

/#
    Destructible
    Types that require manual resource cleanup.
    Replaces IDisposable.
#/
spec Destructible {
    frame destroy(this: *Self);
}

/#
    Cloneable<T>
    Types that can be cloned (deep copy).
#/
spec Cloneable<T> {
    frame clone(this: *T) ret T;
}

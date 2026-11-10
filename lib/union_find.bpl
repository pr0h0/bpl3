# UnionFind: disjoint sets over the integers 0..n-1 (union by size with
# path halving), for connectivity, Kruskal's algorithm and clustering.

export [UnionFind];

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct UnionFind {
    parent: *int,
    sizes: *int,
    count: int,
    sets: int,
    frame new(count: int) ret UnionFind {
        if (count < 0) {
            throw "UnionFind size must be non-negative";
        }
        local uf: UnionFind;
        local bytes: long = cast<long>(count + 1) * sizeof<int>();
        uf.parent = cast<*int>(malloc(bytes));
        uf.sizes = cast<*int>(malloc(bytes));
        if ((uf.parent == nullptr) || (uf.sizes == nullptr)) {
            free(cast<*void>(uf.parent));
            free(cast<*void>(uf.sizes));
            throw "UnionFind allocation failed";
        }
        uf.count = count;
        uf.sets = count;
        loop (local i: int = 0; i < count; i = i + 1) {
            uf.parent[i] = i;
            uf.sizes[i] = 1;
        }
        return uf;
    }

    frame destroy(this: *UnionFind) {
        free(cast<*void>(this.parent));
        free(cast<*void>(this.sizes));
        this.parent = nullptr;
        this.sizes = nullptr;
        this.count = 0;
        this.sets = 0;
    }

    frame _check(this: *UnionFind, element: int) {
        if ((element < 0) || (element >= this.count)) {
            throw "UnionFind element out of range";
        }
    }

    # The representative of the set containing `element`.
    frame find(this: *UnionFind, element: int) ret int {
        this._check(element);
        local x: int = element;
        loop (this.parent[x] != x) {
            this.parent[x] = this.parent[this.parent[x]];
            x = this.parent[x];
        }
        return x;
    }

    # Merges the sets of `a` and `b`; false when they were already joined.
    frame union(this: *UnionFind, a: int, b: int) ret bool {
        local rootA: int = this.find(a);
        local rootB: int = this.find(b);
        if (rootA == rootB) {
            return false;
        }
        if (this.sizes[rootA] < this.sizes[rootB]) {
            local swap: int = rootA;
            rootA = rootB;
            rootB = swap;
        }
        this.parent[rootB] = rootA;
        this.sizes[rootA] = this.sizes[rootA] + this.sizes[rootB];
        this.sets = this.sets - 1;
        return true;
    }

    frame connected(this: *UnionFind, a: int, b: int) ret bool {
        return this.find(a) == this.find(b);
    }

    # The number of elements in the set containing `element`.
    frame setSize(this: *UnionFind, element: int) ret int {
        return this.sizes[this.find(element)];
    }

    # The number of disjoint sets.
    frame setCount(this: *UnionFind) ret int {
        return this.sets;
    }

    frame len(this: *UnionFind) ret int {
        return this.count;
    }
}

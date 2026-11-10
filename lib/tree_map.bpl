# TreeMap<K, V>: an ordered map backed by an AVL tree.
#
# Keys are ordered by a comparator `Lambda<int>(K, K)` that returns a
# negative, zero or positive number. Lookups, insertions and removals are
# O(log n). Iteration (`keys`, `values`, `forEach`, ranges) is in ascending
# key order. Keys and values are stored by value and not destroyed.

export [TreeMap];
export compareInts;
export compareLongs;
export compareStrings;

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strcmp(left: string, right: string) ret int;

# Ready-made comparators.
frame compareInts(a: int, b: int) ret int {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}

frame compareLongs(a: long, b: long) ret int {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}

frame compareStrings(a: string, b: string) ret int {
    return strcmp(a, b);
}

struct TreeMapNode<K, V> {
    key: K,
    value: V,
    height: int,
    left: *TreeMapNode<K, V>,
    right: *TreeMapNode<K, V>,
}

struct TreeMap<K, V> {
    root: *TreeMapNode<K, V>,
    count: int,
    compare: Lambda<int>(K, K),
    frame new(compare: Lambda<int>(K, K)) ret TreeMap<K, V> {
        local map: TreeMap<K, V>;
        map.root = nullptr;
        map.count = 0;
        map.compare = compare;
        return map;
    }

    frame _cmp(this: *TreeMap<K, V>, a: K, b: K) ret int {
        local compare: Lambda<int>(K, K) = this.compare;
        return compare(a, b);
    }

    frame _height(node: *TreeMapNode<K, V>) ret int {
        if (node == nullptr) {
            return 0;
        }
        return node.height;
    }

    frame _update(node: *TreeMapNode<K, V>) {
        local left: int = TreeMap<K, V>._height(node.left);
        local right: int = TreeMap<K, V>._height(node.right);
        if (left > right) {
            node.height = left + 1;
        } else {
            node.height = right + 1;
        }
    }

    frame _rotateRight(node: *TreeMapNode<K, V>) ret *TreeMapNode<K, V> {
        local pivot: *TreeMapNode<K, V> = node.left;
        node.left = pivot.right;
        pivot.right = node;
        TreeMap<K, V>._update(node);
        TreeMap<K, V>._update(pivot);
        return pivot;
    }

    frame _rotateLeft(node: *TreeMapNode<K, V>) ret *TreeMapNode<K, V> {
        local pivot: *TreeMapNode<K, V> = node.right;
        node.right = pivot.left;
        pivot.left = node;
        TreeMap<K, V>._update(node);
        TreeMap<K, V>._update(pivot);
        return pivot;
    }

    frame _balance(node: *TreeMapNode<K, V>) ret *TreeMapNode<K, V> {
        TreeMap<K, V>._update(node);
        local factor: int = TreeMap<K, V>._height(node.left) - TreeMap<K, V>._height(node.right);
        if (factor > 1) {
            if (TreeMap<K, V>._height(node.left.left) < TreeMap<K, V>._height(node.left.right)) {
                node.left = TreeMap<K, V>._rotateLeft(node.left);
            }
            return TreeMap<K, V>._rotateRight(node);
        }
        if (factor < -1) {
            if (TreeMap<K, V>._height(node.right.right) < TreeMap<K, V>._height(node.right.left)) {
                node.right = TreeMap<K, V>._rotateRight(node.right);
            }
            return TreeMap<K, V>._rotateLeft(node);
        }
        return node;
    }

    frame _insert(this: *TreeMap<K, V>, node: *TreeMapNode<K, V>, key: K, value: V, added: *bool) ret *TreeMapNode<K, V> {
        if (node == nullptr) {
            local fresh: *TreeMapNode<K, V> = cast<*TreeMapNode<K, V>>(malloc(sizeof<TreeMapNode<K, V>>()));
            if (fresh == nullptr) {
                throw "TreeMap allocation failed";
            }
            fresh.key = key;
            fresh.value = value;
            fresh.height = 1;
            fresh.left = nullptr;
            fresh.right = nullptr;
            *added = true;
            return fresh;
        }
        local order: int = this._cmp(key, node.key);
        if (order < 0) {
            node.left = this._insert(node.left, key, value, added);
        } else if (order > 0) {
            node.right = this._insert(node.right, key, value, added);
        } else {
            node.value = value;
            return node;
        }
        return TreeMap<K, V>._balance(node);
    }

    # Inserts or replaces `key`; returns true when the key was new.
    frame put(this: *TreeMap<K, V>, key: K, value: V) ret bool {
        local added: bool = false;
        this.root = this._insert(this.root, key, value, &added);
        if (added) {
            this.count = this.count + 1;
        }
        return added;
    }

    frame _find(this: *TreeMap<K, V>, key: K) ret *TreeMapNode<K, V> {
        local node: *TreeMapNode<K, V> = this.root;
        loop (node != nullptr) {
            local order: int = this._cmp(key, node.key);
            if (order == 0) {
                return node;
            }
            if (order < 0) {
                node = node.left;
            } else {
                node = node.right;
            }
        }
        return nullptr;
    }

    frame get(this: *TreeMap<K, V>, key: K) ret Option<V> {
        local node: *TreeMapNode<K, V> = this._find(key);
        if (node == nullptr) {
            return Option<V>.None;
        }
        return Option<V>.Some(node.value);
    }

    frame getOr(this: *TreeMap<K, V>, key: K, fallback: V) ret V {
        local node: *TreeMapNode<K, V> = this._find(key);
        if (node == nullptr) {
            return fallback;
        }
        return node.value;
    }

    frame has(this: *TreeMap<K, V>, key: K) ret bool {
        return this._find(key) != nullptr;
    }

    frame _removeMin(node: *TreeMapNode<K, V>, removed: **TreeMapNode<K, V>) ret *TreeMapNode<K, V> {
        if (node.left == nullptr) {
            *removed = node;
            return node.right;
        }
        node.left = TreeMap<K, V>._removeMin(node.left, removed);
        return TreeMap<K, V>._balance(node);
    }

    frame _remove(this: *TreeMap<K, V>, node: *TreeMapNode<K, V>, key: K, removed: *bool) ret *TreeMapNode<K, V> {
        if (node == nullptr) {
            return nullptr;
        }
        local order: int = this._cmp(key, node.key);
        if (order < 0) {
            node.left = this._remove(node.left, key, removed);
        } else if (order > 0) {
            node.right = this._remove(node.right, key, removed);
        } else {
            *removed = true;
            local left: *TreeMapNode<K, V> = node.left;
            local right: *TreeMapNode<K, V> = node.right;
            free(cast<*void>(node));
            if (right == nullptr) {
                return left;
            }
            local successor: *TreeMapNode<K, V> = nullptr;
            local rest: *TreeMapNode<K, V> = TreeMap<K, V>._removeMin(right, &successor);
            successor.left = left;
            successor.right = rest;
            return TreeMap<K, V>._balance(successor);
        }
        return TreeMap<K, V>._balance(node);
    }

    # Removes `key`; returns whether it was present.
    frame remove(this: *TreeMap<K, V>, key: K) ret bool {
        local removed: bool = false;
        this.root = this._remove(this.root, key, &removed);
        if (removed) {
            this.count = this.count - 1;
        }
        return removed;
    }

    frame len(this: *TreeMap<K, V>) ret int {
        return this.count;
    }

    frame isEmpty(this: *TreeMap<K, V>) ret bool {
        return this.count == 0;
    }

    # Tree height (0 when empty); at most about 1.44 log2(n + 2).
    frame height(this: *TreeMap<K, V>) ret int {
        return TreeMap<K, V>._height(this.root);
    }

    frame minKey(this: *TreeMap<K, V>) ret Option<K> {
        local node: *TreeMapNode<K, V> = this.root;
        if (node == nullptr) {
            return Option<K>.None;
        }
        loop (node.left != nullptr) {
            node = node.left;
        }
        return Option<K>.Some(node.key);
    }

    frame maxKey(this: *TreeMap<K, V>) ret Option<K> {
        local node: *TreeMapNode<K, V> = this.root;
        if (node == nullptr) {
            return Option<K>.None;
        }
        loop (node.right != nullptr) {
            node = node.right;
        }
        return Option<K>.Some(node.key);
    }

    # The greatest key <= `key`.
    frame floorKey(this: *TreeMap<K, V>, key: K) ret Option<K> {
        local node: *TreeMapNode<K, V> = this.root;
        local best: Option<K> = Option<K>.None;
        loop (node != nullptr) {
            local order: int = this._cmp(key, node.key);
            if (order == 0) {
                return Option<K>.Some(node.key);
            }
            if (order < 0) {
                node = node.left;
            } else {
                best = Option<K>.Some(node.key);
                node = node.right;
            }
        }
        return best;
    }

    # The smallest key >= `key`.
    frame ceilingKey(this: *TreeMap<K, V>, key: K) ret Option<K> {
        local node: *TreeMapNode<K, V> = this.root;
        local best: Option<K> = Option<K>.None;
        loop (node != nullptr) {
            local order: int = this._cmp(key, node.key);
            if (order == 0) {
                return Option<K>.Some(node.key);
            }
            if (order > 0) {
                node = node.right;
            } else {
                best = Option<K>.Some(node.key);
                node = node.left;
            }
        }
        return best;
    }

    # Nodes with low <= key < high in ascending order (every node when
    # `bounded` is false).
    frame _collect(this: *TreeMap<K, V>, bounded: bool, low: K, high: K) ret Array<*TreeMapNode<K, V>> {
        local out: Array<*TreeMapNode<K, V>> = Array<*TreeMapNode<K, V>>.new(this.count);
        local stack: Array<*TreeMapNode<K, V>> = Array<*TreeMapNode<K, V>>.new(32);
        local node: *TreeMapNode<K, V> = this.root;
        loop ((node != nullptr) || (stack.length > 0)) {
            loop (node != nullptr) {
                if (bounded && (this._cmp(node.key, low) < 0)) {
                    node = node.right;
                } else {
                    stack.push(node);
                    node = node.left;
                }
            }
            if (stack.length == 0) {
                break;
            }
            local current: *TreeMapNode<K, V> = stack.pop();
            if (bounded && (this._cmp(current.key, high) >= 0)) {
                break;
            }
            out.push(current);
            node = current.right;
        }
        stack.destroy();
        return out;
    }

    frame _visit(nodes: Array<*TreeMapNode<K, V>>, visit: Lambda<void>(K, V)) {
        local list: Array<*TreeMapNode<K, V>> = nodes;
        defer list.destroy();
        loop (local i: int = 0; i < list.length; i = i + 1) {
            visit(list.data[i].key, list.data[i].value);
        }
    }

    # Visits every entry in ascending key order.
    frame forEach(this: *TreeMap<K, V>, visit: Lambda<void>(K, V)) {
        if (this.root == nullptr) {
            return;
        }
        TreeMap<K, V>._visit(this._collect(false, this.root.key, this.root.key), visit);
    }

    # Visits entries with low <= key < high in ascending order.
    frame forEachInRange(this: *TreeMap<K, V>, low: K, high: K, visit: Lambda<void>(K, V)) {
        TreeMap<K, V>._visit(this._collect(true, low, high), visit);
    }

    frame _keysOf(nodes: Array<*TreeMapNode<K, V>>) ret Array<K> {
        local list: Array<*TreeMapNode<K, V>> = nodes;
        local out: Array<K> = Array<K>.new(list.length);
        loop (local i: int = 0; i < list.length; i = i + 1) {
            out.push(list.data[i].key);
        }
        list.destroy();
        return out;
    }

    # Keys in ascending order (a new array).
    frame keys(this: *TreeMap<K, V>) ret Array<K> {
        if (this.root == nullptr) {
            return Array<K>.new(0);
        }
        return TreeMap<K, V>._keysOf(this._collect(false, this.root.key, this.root.key));
    }

    # Values in ascending key order (a new array).
    frame values(this: *TreeMap<K, V>) ret Array<V> {
        local out: Array<V> = Array<V>.new(this.count);
        if (this.root == nullptr) {
            return out;
        }
        local nodes: Array<*TreeMapNode<K, V>> = this._collect(false, this.root.key, this.root.key);
        loop (local i: int = 0; i < nodes.length; i = i + 1) {
            out.push(nodes.data[i].value);
        }
        nodes.destroy();
        return out;
    }

    # Keys with low <= key < high, ascending.
    frame keysInRange(this: *TreeMap<K, V>, low: K, high: K) ret Array<K> {
        return TreeMap<K, V>._keysOf(this._collect(true, low, high));
    }

    frame _freeAll(node: *TreeMapNode<K, V>) {
        if (node == nullptr) {
            return;
        }
        TreeMap<K, V>._freeAll(node.left);
        TreeMap<K, V>._freeAll(node.right);
        free(cast<*void>(node));
    }

    frame clear(this: *TreeMap<K, V>) {
        TreeMap<K, V>._freeAll(this.root);
        this.root = nullptr;
        this.count = 0;
    }

    frame destroy(this: *TreeMap<K, V>) {
        this.clear();
    }
}

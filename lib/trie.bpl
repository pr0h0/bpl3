# Trie<V>: a byte-wise prefix tree mapping null-terminated string keys to
# values, with prefix queries. Keys are copied; values are stored by value
# and not destroyed by the trie.

export [Trie];

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;

struct _TrieNode<V> {
    byte: u8,
    terminal: bool,
    value: V,
    # Number of keys stored at or below this node.
    below: int,
    child: *_TrieNode<V>,
    sibling: *_TrieNode<V>,
}

struct Trie<V> {
    root: *_TrieNode<V>,
    count: int,
    frame new() ret Trie<V> {
        local trie: Trie<V>;
        trie.root = Trie<V>._node(cast<u8>(0));
        trie.count = 0;
        return trie;
    }

    frame _node(byte: u8) ret *_TrieNode<V> {
        local node: *_TrieNode<V> = cast<*_TrieNode<V>>(malloc(sizeof<_TrieNode<V>>()));
        if (node == nullptr) {
            throw "Trie allocation failed";
        }
        node.byte = byte;
        node.terminal = false;
        node.below = 0;
        node.child = nullptr;
        node.sibling = nullptr;
        return node;
    }

    frame _freeNode(node: *_TrieNode<V>) {
        # Children are freed through an explicit stack to bound recursion.
        local stack: Array<*_TrieNode<V>> = Array<*_TrieNode<V>>.new(16);
        if (node != nullptr) {
            stack.push(node);
        }
        loop (stack.length > 0) {
            local current: *_TrieNode<V> = stack.pop();
            if (current.child != nullptr) {
                stack.push(current.child);
            }
            if (current.sibling != nullptr) {
                stack.push(current.sibling);
            }
            free(cast<*void>(current));
        }
        stack.destroy();
    }

    frame destroy(this: *Trie<V>) {
        Trie<V>._freeNode(this.root);
        this.root = nullptr;
        this.count = 0;
    }

    frame len(this: *Trie<V>) ret int {
        return this.count;
    }

    frame isEmpty(this: *Trie<V>) ret bool {
        return this.count == 0;
    }

    frame _childOf(node: *_TrieNode<V>, byte: u8) ret *_TrieNode<V> {
        local child: *_TrieNode<V> = node.child;
        loop (child != nullptr) {
            if (child.byte == byte) {
                return child;
            }
            child = child.sibling;
        }
        return nullptr;
    }

    # The node reached by `key`, or null.
    frame _walk(this: *Trie<V>, key: string) ret *_TrieNode<V> {
        local node: *_TrieNode<V> = this.root;
        if (key == nullptr) {
            return node;
        }
        local bytes: *u8 = cast<*u8>(key);
        loop (local i: int = 0; (bytes[i] != cast<u8>(0)) && (node != nullptr); i = i + 1) {
            node = Trie<V>._childOf(node, bytes[i]);
        }
        return node;
    }

    # Inserts or replaces `key`; returns true when the key was new.
    frame insert(this: *Trie<V>, key: string, value: V) ret bool {
        local isNew: bool = !this.has(key);
        local node: *_TrieNode<V> = this.root;
        if (isNew) {
            node.below = node.below + 1;
        }
        if (key != nullptr) {
            local bytes: *u8 = cast<*u8>(key);
            loop (local i: int = 0; bytes[i] != cast<u8>(0); i = i + 1) {
                local next: *_TrieNode<V> = Trie<V>._childOf(node, bytes[i]);
                if (next == nullptr) {
                    next = Trie<V>._node(bytes[i]);
                    # Children stay sorted by byte so traversal is ordered.
                    if ((node.child == nullptr) || (node.child.byte > bytes[i])) {
                        next.sibling = node.child;
                        node.child = next;
                    } else {
                        local previous: *_TrieNode<V> = node.child;
                        loop ((previous.sibling != nullptr) && (previous.sibling.byte < bytes[i])) {
                            previous = previous.sibling;
                        }
                        next.sibling = previous.sibling;
                        previous.sibling = next;
                    }
                }
                node = next;
                if (isNew) {
                    node.below = node.below + 1;
                }
            }
        }
        node.terminal = true;
        node.value = value;
        if (isNew) {
            this.count = this.count + 1;
        }
        return isNew;
    }

    frame get(this: *Trie<V>, key: string) ret Option<V> {
        local node: *_TrieNode<V> = this._walk(key);
        if ((node == nullptr) || !node.terminal) {
            return Option<V>.None;
        }
        return Option<V>.Some(node.value);
    }

    frame has(this: *Trie<V>, key: string) ret bool {
        local node: *_TrieNode<V> = this._walk(key);
        return (node != nullptr) && node.terminal;
    }

    # True when some stored key starts with `prefix` ("" matches any key).
    frame hasPrefix(this: *Trie<V>, prefix: string) ret bool {
        local node: *_TrieNode<V> = this._walk(prefix);
        return (node != nullptr) && (node.below > 0);
    }

    # The number of stored keys starting with `prefix`.
    frame countPrefix(this: *Trie<V>, prefix: string) ret int {
        local node: *_TrieNode<V> = this._walk(prefix);
        if (node == nullptr) {
            return 0;
        }
        return node.below;
    }

    # Removes `key`; returns whether it was present. Empty branches are freed.
    frame remove(this: *Trie<V>, key: string) ret bool {
        if (!this.has(key)) {
            return false;
        }
        local node: *_TrieNode<V> = this.root;
        node.below = node.below - 1;
        if (key != nullptr) {
            local bytes: *u8 = cast<*u8>(key);
            loop (local i: int = 0; bytes[i] != cast<u8>(0); i = i + 1) {
                local next: *_TrieNode<V> = Trie<V>._childOf(node, bytes[i]);
                next.below = next.below - 1;
                if (next.below == 0) {
                    # Detach and free the whole now-empty branch.
                    if (node.child == next) {
                        node.child = next.sibling;
                    } else {
                        local previous: *_TrieNode<V> = node.child;
                        loop (previous.sibling != next) {
                            previous = previous.sibling;
                        }
                        previous.sibling = next.sibling;
                    }
                    next.sibling = nullptr;
                    Trie<V>._freeNode(next);
                    this.count = this.count - 1;
                    return true;
                }
                node = next;
            }
        }
        node.terminal = false;
        this.count = this.count - 1;
        return true;
    }

    # Stored keys starting with `prefix`, in byte order. The caller destroys
    # each String and the array.
    frame keysWithPrefix(this: *Trie<V>, prefix: string) ret Array<String> {
        local out: Array<String> = Array<String>.new(8);
        local start: *_TrieNode<V> = this._walk(prefix);
        if (start == nullptr) {
            return out;
        }
        local prefixLength: long = 0;
        if (prefix != nullptr) {
            prefixLength = strlen(prefix);
        }
        # Iterative depth-first walk keeping the current key in `buffer`.
        local capacity: long = prefixLength + 64;
        local buffer: string = cast<string>(malloc(capacity));
        if (buffer == nullptr) {
            throw "Trie allocation failed";
        }
        loop (local i: long = 0; i < prefixLength; i = i + 1) {
            buffer[i] = prefix[i];
        }
        local nodes: Array<*_TrieNode<V>> = Array<*_TrieNode<V>>.new(16);
        local depths: Array<long> = Array<long>.new(16);
        if (start.terminal) {
            buffer[prefixLength] = cast<char>(0);
            out.push(String.new(buffer));
        }
        if (start.child != nullptr) {
            nodes.push(start.child);
            depths.push(prefixLength);
        }
        loop (nodes.length > 0) {
            local node: *_TrieNode<V> = nodes.pop();
            local depth: long = depths.pop();
            if ((depth + 2) >= capacity) {
                local grown: string = cast<string>(malloc(capacity * 2));
                if (grown == nullptr) {
                    free(cast<*void>(buffer));
                    throw "Trie allocation failed";
                }
                loop (local j: long = 0; j < depth; j = j + 1) {
                    grown[j] = buffer[j];
                }
                free(cast<*void>(buffer));
                buffer = grown;
                capacity = capacity * 2;
            }
            buffer[depth] = cast<char>(node.byte);
            # Siblings are visited after this subtree, so push them first.
            if (node.sibling != nullptr) {
                nodes.push(node.sibling);
                depths.push(depth);
            }
            if (node.terminal) {
                buffer[depth + 1] = cast<char>(0);
                out.push(String.new(buffer));
            }
            if (node.child != nullptr) {
                nodes.push(node.child);
                depths.push(depth + 1);
            }
        }
        nodes.destroy();
        depths.destroy();
        free(cast<*void>(buffer));
        return out;
    }

    # The longest stored key that is a prefix of `text`, as a byte length
    # (-1 when none matches).
    frame longestPrefixOf(this: *Trie<V>, text: string) ret int {
        local node: *_TrieNode<V> = this.root;
        local best: int = -1;
        if (node.terminal) {
            best = 0;
        }
        if (text == nullptr) {
            return best;
        }
        local bytes: *u8 = cast<*u8>(text);
        loop (local i: int = 0; bytes[i] != cast<u8>(0); i = i + 1) {
            node = Trie<V>._childOf(node, bytes[i]);
            if (node == nullptr) {
                return best;
            }
            if (node.terminal) {
                best = i + 1;
            }
        }
        return best;
    }
}

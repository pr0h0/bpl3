# LinkedList<T> - Doubly Linked List implementation

export [LinkedList];
export [ListNode];
export [LinkedListIterator];

import [Option] from "std/option.bpl";
import [Iterable], [Iterator] from "std/iter_specs.bpl";
import [Destructible] from "std/core_specs.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct ListNode<T> {
    value: T,
    next: *ListNode<T>,
    prev: *ListNode<T>,
}

struct LinkedListIterator<T>: Iterator<T> {
    current: *ListNode<T>,
    frame next(this: *LinkedListIterator<T>) ret Option<T> {
        if (this.current == nullptr) {
            return Option<T>.None;
        }
        local val: T = this.current.value;
        this.current = this.current.next;
        return Option<T>.Some(val);
    }
}

struct LinkedList<T>: Iterable<T>, Destructible {
    head: *ListNode<T>,
    tail: *ListNode<T>,
    length: int,
    frame new() ret LinkedList<T> {
        local list: LinkedList<T>;
        list.head = nullptr;
        list.tail = nullptr;
        list.length = 0;
        return list;
    }

    frame iterator(this: *LinkedList<T>) ret LinkedListIterator<T> {
        local it: LinkedListIterator<T>;
        it.current = this.head;
        return it;
    }

    frame destroy(this: *LinkedList<T>) {
        local current: *ListNode<T> = this.head;
        loop (current != nullptr) {
            local next: *ListNode<T> = current.next;
            free(cast<*void>(current));
            current = next;
        }
        this.head = nullptr;
        this.tail = nullptr;
        this.length = 0;
    }

    frame pushBack(this: *LinkedList<T>, value: T) {
        local node: *ListNode<T> = cast<*ListNode<T>>(malloc(sizeof<ListNode<T>>()));
        node.value = value;
        node.next = nullptr;
        node.prev = this.tail;

        if (this.tail != nullptr) {
            this.tail.next = node;
        } else {
            this.head = node;
        }
        this.tail = node;
        this.length = this.length + 1;
    }

    frame pushFront(this: *LinkedList<T>, value: T) {
        local node: *ListNode<T> = cast<*ListNode<T>>(malloc(sizeof<ListNode<T>>()));
        node.value = value;
        node.next = this.head;
        node.prev = nullptr;

        if (this.head != nullptr) {
            this.head.prev = node;
        } else {
            this.tail = node;
        }
        this.head = node;
        this.length = this.length + 1;
    }

    frame popBack(this: *LinkedList<T>) ret Option<T> {
        if (this.tail == nullptr) {
            return Option<T>.None;
        }
        local node: *ListNode<T> = this.tail;
        local value: T = node.value;

        if (node.prev != nullptr) {
            node.prev.next = nullptr;
            this.tail = node.prev;
        } else {
            this.head = nullptr;
            this.tail = nullptr;
        }
        free(cast<*void>(node));
        this.length = this.length - 1;
        return Option<T>.Some(value);
    }

    frame popFront(this: *LinkedList<T>) ret Option<T> {
        if (this.head == nullptr) {
            return Option<T>.None;
        }
        local node: *ListNode<T> = this.head;
        local value: T = node.value;

        if (node.next != nullptr) {
            node.next.prev = nullptr;
            this.head = node.next;
        } else {
            this.head = nullptr;
            this.tail = nullptr;
        }
        free(cast<*void>(node));
        this.length = this.length - 1;
        return Option<T>.Some(value);
    }

    frame len(this: *LinkedList<T>) ret int {
        return this.length;
    }

    frame isEmpty(this: *LinkedList<T>) ret bool {
        return this.length == 0;
    }

    frame front(this: *LinkedList<T>) ret Option<T> {
        if (this.head == nullptr) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.head.value);
    }

    frame back(this: *LinkedList<T>) ret Option<T> {
        if (this.tail == nullptr) {
            return Option<T>.None;
        }
        return Option<T>.Some(this.tail.value);
    }
}

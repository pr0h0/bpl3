# Graph: a weighted graph over vertices 0..n-1 with classic algorithms.
#
# Edges live in a forward-star list (O(V + E) memory). A directed graph
# stores each edge once; an undirected graph stores both directions.
# Weights are `long`; Dijkstra requires non-negative weights. Results are
# new arrays owned by the caller. Unreachable vertices get distance
# `GRAPH_UNREACHABLE` and predecessor -1.

export [Graph];
export [GraphEdge];
export GRAPH_UNREACHABLE;

import [Option] from "std/option.bpl";
import [Array] from "std/array.bpl";
import [UnionFind] from "std/union_find.bpl";

global GRAPH_UNREACHABLE: long = 9223372036854775807;

# One directed edge in the forward-star list.
struct GraphEdge {
    source: int,
    target: int,
    weight: long,
    next: int,
}

# Binary min-heap of (distance, vertex) used by Dijkstra and Prim.
struct _GraphHeap {
    keys: Array<long>,
    vertices: Array<int>,
    frame new() ret _GraphHeap {
        local heap: _GraphHeap;
        heap.keys = Array<long>.new(16);
        heap.vertices = Array<int>.new(16);
        return heap;
    }

    frame _swap(this: *_GraphHeap, a: int, b: int) {
        local key: long = this.keys.data[a];
        this.keys.data[a] = this.keys.data[b];
        this.keys.data[b] = key;
        local vertex: int = this.vertices.data[a];
        this.vertices.data[a] = this.vertices.data[b];
        this.vertices.data[b] = vertex;
    }

    frame push(this: *_GraphHeap, key: long, vertex: int) {
        this.keys.push(key);
        this.vertices.push(vertex);
        local i: int = this.keys.length - 1;
        loop (i > 0) {
            local parent: int = (i - 1) / 2;
            if (this.keys.data[parent] <= this.keys.data[i]) {
                break;
            }
            this._swap(i, parent);
            i = parent;
        }
    }

    # Removes the minimum; returns its vertex and stores its key.
    frame pop(this: *_GraphHeap, key: *long) ret int {
        *key = this.keys.data[0];
        local vertex: int = this.vertices.data[0];
        local last: int = this.keys.length - 1;
        this._swap(0, last);
        this.keys.length = last;
        this.vertices.length = last;
        local i: int = 0;
        loop {
            local left: int = (2 * i) + 1;
            local right: int = left + 1;
            local smallest: int = i;
            if ((left < last) && (this.keys.data[left] < this.keys.data[smallest])) {
                smallest = left;
            }
            if ((right < last) && (this.keys.data[right] < this.keys.data[smallest])) {
                smallest = right;
            }
            if (smallest == i) {
                break;
            }
            this._swap(i, smallest);
            i = smallest;
        }
        return vertex;
    }

    frame isEmpty(this: *_GraphHeap) ret bool {
        return this.keys.length == 0;
    }

    frame destroy(this: *_GraphHeap) {
        this.keys.destroy();
        this.vertices.destroy();
    }
}

struct Graph {
    vertexCount: int,
    directed: bool,
    head: Array<int>,
    edges: Array<GraphEdge>,
    frame new(vertexCount: int, directed: bool) ret Graph {
        if (vertexCount < 0) {
            throw "Graph vertex count must be non-negative";
        }
        local graph: Graph;
        graph.vertexCount = vertexCount;
        graph.directed = directed;
        graph.head = Array<int>.new(vertexCount);
        graph.edges = Array<GraphEdge>.new(16);
        loop (local i: int = 0; i < vertexCount; i = i + 1) {
            graph.head.push(-1);
        }
        return graph;
    }

    frame directedGraph(vertexCount: int) ret Graph {
        return Graph.new(vertexCount, true);
    }

    frame undirectedGraph(vertexCount: int) ret Graph {
        return Graph.new(vertexCount, false);
    }

    frame destroy(this: *Graph) {
        this.head.destroy();
        this.edges.destroy();
        this.vertexCount = 0;
    }

    frame _check(this: *Graph, vertex: int) {
        if ((vertex < 0) || (vertex >= this.vertexCount)) {
            throw "Graph vertex out of range";
        }
    }

    frame _link(this: *Graph, source: int, target: int, weight: long) {
        this.edges.push(GraphEdge { source: source, target: target, weight: weight, next: this.head.data[source] });
        this.head.data[source] = this.edges.length - 1;
    }

    # Adds a vertex and returns its index.
    frame addVertex(this: *Graph) ret int {
        this.head.push(-1);
        this.vertexCount = this.vertexCount + 1;
        return this.vertexCount - 1;
    }

    # Adds an edge of the given weight (both directions when undirected).
    frame addEdge(this: *Graph, source: int, target: int, weight: long) {
        this._check(source);
        this._check(target);
        this._link(source, target, weight);
        if (!this.directed && (source != target)) {
            this._link(target, source, weight);
        }
    }

    # Adds an edge of weight 1.
    frame connect(this: *Graph, source: int, target: int) {
        this.addEdge(source, target, cast<long>(1));
    }

    frame len(this: *Graph) ret int {
        return this.vertexCount;
    }

    # Logical edges (an undirected edge counts once, a loop once).
    frame edgeCount(this: *Graph) ret int {
        if (this.directed) {
            return this.edges.length;
        }
        local loops: int = 0;
        loop (local i: int = 0; i < this.edges.length; i = i + 1) {
            if (this.edges.data[i].source == this.edges.data[i].target) {
                loops = loops + 1;
            }
        }
        return ((this.edges.length - loops) / 2) + loops;
    }

    frame hasEdge(this: *Graph, source: int, target: int) ret bool {
        this._check(source);
        this._check(target);
        loop (local e: int = this.head.data[source]; e >= 0; e = this.edges.data[e].next) {
            if (this.edges.data[e].target == target) {
                return true;
            }
        }
        return false;
    }

    # Neighbours of `vertex` (most recently added edge first).
    frame neighbors(this: *Graph, vertex: int) ret Array<int> {
        this._check(vertex);
        local out: Array<int> = Array<int>.new(4);
        loop (local e: int = this.head.data[vertex]; e >= 0; e = this.edges.data[e].next) {
            out.push(this.edges.data[e].target);
        }
        return out;
    }

    frame outDegree(this: *Graph, vertex: int) ret int {
        this._check(vertex);
        local degree: int = 0;
        loop (local e: int = this.head.data[vertex]; e >= 0; e = this.edges.data[e].next) {
            degree = degree + 1;
        }
        return degree;
    }

    # Vertices in breadth-first order from `start`.
    frame bfs(this: *Graph, start: int) ret Array<int> {
        this._check(start);
        local order: Array<int> = Array<int>.new(this.vertexCount);
        local seen: Array<bool> = Array<bool>.new(this.vertexCount);
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            seen.push(false);
        }
        seen.data[start] = true;
        order.push(start);
        local cursor: int = 0;
        loop (cursor < order.length) {
            local vertex: int = order.data[cursor];
            cursor = cursor + 1;
            # Visit neighbours in insertion order: collect, then reverse.
            local first: int = order.length;
            loop (local e: int = this.head.data[vertex]; e >= 0; e = this.edges.data[e].next) {
                local next: int = this.edges.data[e].target;
                if (!seen.data[next]) {
                    seen.data[next] = true;
                    order.push(next);
                }
            }
            local last: int = order.length - 1;
            loop (first < last) {
                local swap: int = order.data[first];
                order.data[first] = order.data[last];
                order.data[last] = swap;
                first = first + 1;
                last = last - 1;
            }
        }
        seen.destroy();
        return order;
    }

    # Edge counts from `start` (-1 when unreachable).
    frame bfsDistances(this: *Graph, start: int) ret Array<int> {
        this._check(start);
        local distance: Array<int> = Array<int>.new(this.vertexCount);
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            distance.push(-1);
        }
        local queue: Array<int> = Array<int>.new(this.vertexCount);
        distance.data[start] = 0;
        queue.push(start);
        local cursor: int = 0;
        loop (cursor < queue.length) {
            local vertex: int = queue.data[cursor];
            cursor = cursor + 1;
            loop (local e: int = this.head.data[vertex]; e >= 0; e = this.edges.data[e].next) {
                local next: int = this.edges.data[e].target;
                if (distance.data[next] < 0) {
                    distance.data[next] = distance.data[vertex] + 1;
                    queue.push(next);
                }
            }
        }
        queue.destroy();
        return distance;
    }

    # Vertices in depth-first preorder from `start`, following edges in
    # insertion order.
    frame dfs(this: *Graph, start: int) ret Array<int> {
        this._check(start);
        local order: Array<int> = Array<int>.new(this.vertexCount);
        local seen: Array<bool> = Array<bool>.new(this.vertexCount);
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            seen.push(false);
        }
        local stack: Array<int> = Array<int>.new(16);
        stack.push(start);
        loop (stack.length > 0) {
            local vertex: int = stack.pop();
            if (seen.data[vertex]) {
                continue;
            }
            seen.data[vertex] = true;
            order.push(vertex);
            # The edge list is newest first, so pushing in list order makes
            # the oldest edge pop first.
            loop (local e: int = this.head.data[vertex]; e >= 0; e = this.edges.data[e].next) {
                if (!seen.data[this.edges.data[e].target]) {
                    stack.push(this.edges.data[e].target);
                }
            }
        }
        stack.destroy();
        seen.destroy();
        return order;
    }

    /#
        Shortest-path distances from `start` (Dijkstra). Stores each vertex's
        predecessor in `previous` when it is not null (-1 for the start and
        unreachable vertices). Throws on a negative edge weight.
    #/
    frame dijkstraWith(this: *Graph, start: int, previous: *Array<int>) ret Array<long> {
        this._check(start);
        loop (local i: int = 0; i < this.edges.length; i = i + 1) {
            if (this.edges.data[i].weight < cast<long>(0)) {
                throw "Graph.dijkstra requires non-negative weights";
            }
        }
        local distance: Array<long> = Array<long>.new(this.vertexCount);
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            distance.push(GRAPH_UNREACHABLE);
            if (previous != nullptr) {
                previous.push(-1);
            }
        }
        local heap: _GraphHeap = _GraphHeap.new();
        distance.data[start] = 0;
        heap.push(cast<long>(0), start);
        loop (!heap.isEmpty()) {
            local key: long = 0;
            local vertex: int = heap.pop(&key);
            if (key > distance.data[vertex]) {
                continue;
            }
            loop (local e: int = this.head.data[vertex]; e >= 0; e = this.edges.data[e].next) {
                local edge: GraphEdge = this.edges.data[e];
                local candidate: long = key + edge.weight;
                if (candidate < distance.data[edge.target]) {
                    distance.data[edge.target] = candidate;
                    if (previous != nullptr) {
                        previous.data[edge.target] = vertex;
                    }
                    heap.push(candidate, edge.target);
                }
            }
        }
        heap.destroy();
        return distance;
    }

    frame dijkstra(this: *Graph, start: int) ret Array<long> {
        return this.dijkstraWith(start, nullptr);
    }

    # Vertices of a shortest path from `source` to `target` (empty if unreachable).
    frame shortestPath(this: *Graph, source: int, target: int) ret Array<int> {
        this._check(target);
        local previous: Array<int> = Array<int>.new(this.vertexCount);
        local distance: Array<long> = this.dijkstraWith(source, &previous);
        local path: Array<int> = Array<int>.new(8);
        if (distance.data[target] != GRAPH_UNREACHABLE) {
            loop (local v: int = target; v >= 0; v = previous.data[v]) {
                path.push(v);
            }
            local i: int = 0;
            local j: int = path.length - 1;
            loop (i < j) {
                local swap: int = path.data[i];
                path.data[i] = path.data[j];
                path.data[j] = swap;
                i = i + 1;
                j = j - 1;
            }
        }
        distance.destroy();
        previous.destroy();
        return path;
    }

    /#
        Bellman-Ford distances from `start`, allowing negative weights.
        Returns None when a negative cycle is reachable from `start`.
    #/
    frame bellmanFord(this: *Graph, start: int) ret Option<Array<long>> {
        this._check(start);
        local distance: Array<long> = Array<long>.new(this.vertexCount);
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            distance.push(GRAPH_UNREACHABLE);
        }
        distance.data[start] = 0;
        loop (local round: int = 0; round < this.vertexCount; round = round + 1) {
            local changed: bool = false;
            loop (local e: int = 0; e < this.edges.length; e = e + 1) {
                local edge: GraphEdge = this.edges.data[e];
                if (distance.data[edge.source] != GRAPH_UNREACHABLE) {
                    local candidate: long = distance.data[edge.source] + edge.weight;
                    if (candidate < distance.data[edge.target]) {
                        distance.data[edge.target] = candidate;
                        changed = true;
                    }
                }
            }
            if (!changed) {
                return Option<Array<long>>.Some(distance);
            }
        }
        distance.destroy();
        return Option<Array<long>>.None;
    }

    # A topological order of a directed graph (Kahn's algorithm, smallest
    # ready vertex first), or None when it has a cycle.
    frame topologicalSort(this: *Graph) ret Option<Array<int>> {
        local indegree: Array<int> = Array<int>.new(this.vertexCount);
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            indegree.push(0);
        }
        loop (local e: int = 0; e < this.edges.length; e = e + 1) {
            local target: int = this.edges.data[e].target;
            indegree.data[target] = indegree.data[target] + 1;
        }
        local ready: _GraphHeap = _GraphHeap.new();
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            if (indegree.data[i] == 0) {
                ready.push(cast<long>(i), i);
            }
        }
        local order: Array<int> = Array<int>.new(this.vertexCount);
        loop (!ready.isEmpty()) {
            local key: long = 0;
            local vertex: int = ready.pop(&key);
            order.push(vertex);
            loop (local e: int = this.head.data[vertex]; e >= 0; e = this.edges.data[e].next) {
                local target: int = this.edges.data[e].target;
                indegree.data[target] = indegree.data[target] - 1;
                if (indegree.data[target] == 0) {
                    ready.push(cast<long>(target), target);
                }
            }
        }
        ready.destroy();
        indegree.destroy();
        if (order.length != this.vertexCount) {
            order.destroy();
            return Option<Array<int>>.None;
        }
        return Option<Array<int>>.Some(order);
    }

    # Whether the graph contains a cycle (a directed cycle, or for an
    # undirected graph any cycle including self-loops and parallel edges).
    frame hasCycle(this: *Graph) ret bool {
        if (this.directed) {
            local order: Option<Array<int>> = this.topologicalSort();
            if (order.isNone()) {
                return true;
            }
            local values: Array<int> = order.unwrap();
            values.destroy();
            return false;
        }
        local sets: UnionFind = UnionFind.new(this.vertexCount);
        local cyclic: bool = false;
        # Each undirected edge is stored as two consecutive directed edges
        # (one for self-loops).
        local e: int = 0;
        loop (e < this.edges.length) {
            local edge: GraphEdge = this.edges.data[e];
            if (edge.source == edge.target) {
                cyclic = true;
                break;
            }
            if (!sets.union(edge.source, edge.target)) {
                cyclic = true;
                break;
            }
            e = e + 2;
        }
        sets.destroy();
        return cyclic;
    }

    # A component label per vertex (0, 1, ... in order of first vertex),
    # treating edges as undirected. Stores the component count in `count`
    # when it is not null.
    frame connectedComponents(this: *Graph, count: *int) ret Array<int> {
        local sets: UnionFind = UnionFind.new(this.vertexCount);
        loop (local e: int = 0; e < this.edges.length; e = e + 1) {
            sets.union(this.edges.data[e].source, this.edges.data[e].target);
        }
        local label: Array<int> = Array<int>.new(this.vertexCount);
        local rootLabel: Array<int> = Array<int>.new(this.vertexCount);
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            label.push(-1);
            rootLabel.push(-1);
        }
        local next: int = 0;
        loop (local i: int = 0; i < this.vertexCount; i = i + 1) {
            local root: int = sets.find(i);
            if (rootLabel.data[root] < 0) {
                rootLabel.data[root] = next;
                next = next + 1;
            }
            label.data[i] = rootLabel.data[root];
        }
        if (count != nullptr) {
            *count = next;
        }
        rootLabel.destroy();
        sets.destroy();
        return label;
    }

    # Strongly connected components of a directed graph (Kosaraju). Labels
    # are numbered in topological order of the condensation.
    frame stronglyConnectedComponents(this: *Graph, count: *int) ret Array<int> {
        local n: int = this.vertexCount;
        local seen: Array<bool> = Array<bool>.new(n);
        local finish: Array<int> = Array<int>.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            seen.push(false);
        }
        # Iterative DFS recording finishing order.
        local stack: Array<int> = Array<int>.new(16);
        local cursor: Array<int> = Array<int>.new(16);
        loop (local s: int = 0; s < n; s = s + 1) {
            if (seen.data[s]) {
                continue;
            }
            seen.data[s] = true;
            stack.push(s);
            cursor.push(this.head.data[s]);
            loop (stack.length > 0) {
                local top: int = stack.length - 1;
                local e: int = cursor.data[top];
                if (e < 0) {
                    finish.push(stack.pop());
                    cursor.pop();
                    continue;
                }
                cursor.data[top] = this.edges.data[e].next;
                local target: int = this.edges.data[e].target;
                if (!seen.data[target]) {
                    seen.data[target] = true;
                    stack.push(target);
                    cursor.push(this.head.data[target]);
                }
            }
        }
        # Reverse graph.
        local reverse: Graph = Graph.new(n, true);
        loop (local e: int = 0; e < this.edges.length; e = e + 1) {
            reverse._link(this.edges.data[e].target, this.edges.data[e].source, cast<long>(1));
        }
        local label: Array<int> = Array<int>.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            label.push(-1);
        }
        local components: int = 0;
        loop (local f: int = n - 1; f >= 0; f = f - 1) {
            local root: int = finish.data[f];
            if (label.data[root] >= 0) {
                continue;
            }
            stack.push(root);
            label.data[root] = components;
            loop (stack.length > 0) {
                local vertex: int = stack.pop();
                loop (local e: int = reverse.head.data[vertex]; e >= 0; e = reverse.edges.data[e].next) {
                    local target: int = reverse.edges.data[e].target;
                    if (label.data[target] < 0) {
                        label.data[target] = components;
                        stack.push(target);
                    }
                }
            }
            components = components + 1;
        }
        if (count != nullptr) {
            *count = components;
        }
        reverse.destroy();
        stack.destroy();
        cursor.destroy();
        finish.destroy();
        seen.destroy();
        return label;
    }

    /#
        Minimum spanning forest of an undirected graph (Kruskal). Returns the
        chosen edges; their total weight is stored in `total` when not null.
    #/
    frame minimumSpanningTree(this: *Graph, total: *long) ret Array<GraphEdge> {
        local candidates: Array<GraphEdge> = Array<GraphEdge>.new(this.edges.length);
        loop (local e: int = 0; e < this.edges.length; e = e + 1) {
            local edge: GraphEdge = this.edges.data[e];
            if (this.directed || (edge.source <= edge.target)) {
                candidates.push(edge);
            }
        }
        candidates.sortBy(|a: GraphEdge, b: GraphEdge| ret int {
            if (a.weight < b.weight) {
                return -1;
            }
            if (a.weight > b.weight) {
                return 1;
            }
            return 0;
        });
        local sets: UnionFind = UnionFind.new(this.vertexCount);
        local chosen: Array<GraphEdge> = Array<GraphEdge>.new(this.vertexCount);
        local sum: long = 0;
        loop (local i: int = 0; i < candidates.length; i = i + 1) {
            local edge: GraphEdge = candidates.data[i];
            if (sets.union(edge.source, edge.target)) {
                chosen.push(edge);
                sum = sum + edge.weight;
            }
        }
        if (total != nullptr) {
            *total = sum;
        }
        sets.destroy();
        candidates.destroy();
        return chosen;
    }

    # Whether the graph can be two-coloured (bipartite), treating edges as
    # undirected.
    frame isBipartite(this: *Graph) ret bool {
        local n: int = this.vertexCount;
        local colour: Array<int> = Array<int>.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            colour.push(-1);
        }
        # Undirected adjacency, also for directed graphs.
        local undirected: Graph = Graph.new(n, false);
        loop (local e: int = 0; e < this.edges.length; e = e + 1) {
            undirected._link(this.edges.data[e].source, this.edges.data[e].target, cast<long>(1));
            undirected._link(this.edges.data[e].target, this.edges.data[e].source, cast<long>(1));
        }
        local queue: Array<int> = Array<int>.new(n);
        local ok: bool = true;
        loop (local s: int = 0; (s < n) && ok; s = s + 1) {
            if (colour.data[s] >= 0) {
                continue;
            }
            colour.data[s] = 0;
            queue.clear();
            queue.push(s);
            local cursor: int = 0;
            loop ((cursor < queue.length) && ok) {
                local vertex: int = queue.data[cursor];
                cursor = cursor + 1;
                loop (local e: int = undirected.head.data[vertex]; e >= 0; e = undirected.edges.data[e].next) {
                    local target: int = undirected.edges.data[e].target;
                    if (colour.data[target] < 0) {
                        colour.data[target] = 1 - colour.data[vertex];
                        queue.push(target);
                    } else if (colour.data[target] == colour.data[vertex]) {
                        ok = false;
                    }
                }
            }
        }
        queue.destroy();
        undirected.destroy();
        colour.destroy();
        return ok;
    }
}

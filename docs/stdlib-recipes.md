# Find a standard-library API by task

Use the [generated declaration reference](stdlib-reference.md) for exact exports
and overloads. The table below links everyday tasks to existing APIs and their
ownership/error contracts; it does not introduce new APIs.

| Task                          | Existing API                                                                      | Ownership and failure checks                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grow a sequence               | `Array<T>.new`, `push`, `get` in [collections](30-stdlib-collections.md)          | The array owns its backing storage. Pass a pointer to borrow it. Bounds violations throw; validate indexes. Do not shallow-copy owning storage and destroy both copies.                                                               |
| Look up an optional key       | `Map<K,V>.get` and `Option<T>` in [collections](30-stdlib-collections.md)         | Check the option before `unwrap`; a returned value is not permission to release storage still owned by the map. Mutation can invalidate iterators/references. Consult the concrete container's element cleanup contract.              |
| Split or build text           | `String.split`, `StringBuilder` in [strings](29-stdlib-string.md)                 | `String` owns a buffer; `string` is a borrowed C string pointer. A split returns an array of strings: account for both element resources and array storage according to their APIs. Keep the source alive for borrowed pointers.      |
| Read a text file              | `FS.readFile` in [filesystem](31-stdlib-fs.md)                                    | The result is an owning `String`. Check/catch the documented read failure; an existence check does not guarantee a later read succeeds.                                                                                               |
| Stream binary data            | `File.open`, `readBytes`, `writeBytes`, `close` in [filesystem](31-stdlib-fs.md)  | Check the open handle. The caller owns the byte buffer. A positive-length read returning zero means EOF; read failures throw `IOError`. Check writes and the boolean close result.                                                    |
| Parse structured JSON         | `JSON.parse<T>`, `JSON.free<T>` in [declarations](stdlib-reference.md#stdjsonbpl) | Parsing returns a pointer or `nullptr`; check it before dereferencing. Release a successful parsed object with `JSON.free<T>` so nested allocations are handled. Do not also free the same object manually.                           |
| Parse command-line input      | `ArgParser`, `ParsedArgs` in [declarations](stdlib-reference.md) | Inspect parse error state before using values. Stored flag values belong to the parsed result; copying a pointer does not transfer ownership. Release owned parse results through their API.                                          |
| Average samples               | `Algorithm.average` in [algorithms](34-stdlib-algorithms.md)                      | Borrows the input array. Empty average/min/max return the documented zero; `merge` concatenates. Do not assume sorted merging or an exception on empty input. Numeric edge-case guarantees are specific to each documented operation. |
| Decode bytes or validate text | `Base64`, `Hex`, `UTF8` in [API guide](48-stdlib-api.md)                          | Distinguish decoding failure from an empty successful result and keep decoded storage alive until consumption finishes. Use the selected decoder's documented alphabet/padding policy.                                                |

For resource cleanup, read [constructors and destructors](21-constructors-destructors.md),
[manual memory](22-manual-memory.md), and [exceptions](26-try-catch.md). Assigning
an owning value does not make a deep clone. Use a documented clone operation
when two independent owners are needed. Raw pointers and bound methods borrow
storage and do not extend its lifetime. Avoid relying on automatic local cleanup
across a callee's throwing frame; use the explicitly supported `defer` mechanism
for resources requiring cleanup on exceptional exits.

Error conventions differ across current APIs: some return `Option`/`nullptr` or
a boolean, while others throw. Preserve that distinction at call sites instead
of treating every empty, zero or false result as an exception. Threading and
synchronization placeholder modules do not implement native concurrency; use
only the capabilities described in the API guide.

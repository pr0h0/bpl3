# bpl-db

An in-memory typed table store with a small snapshot format. For transactional
web application persistence, use the optional `bpl-sqlite` package instead.
This package is not a SQL server: `Query` wraps typed `Command` values;
the internal `parse_query` placeholder is not exported or usable as a SQL parser.

Create a `Database`, call `create_table(name)`, add columns with `DataType.Int`,
`Str`, or `Bool`, and pass an `Array<Value>` pointer to `Table.insert`.
Insert returns a positive ID or -1 for invalid width/type or exhausted IDs.
Null values are accepted. Zero-column tables accept empty value arrays; their
rows and IDs are preserved by save/load. Table and column names contain 1–128 ASCII letters,
digits, or underscores. Creating an existing table returns it; columns must be
unique and added before any rows.

Tables copy names and inserted strings. Caller input arrays and strings remain
caller-owned. Stored rows and strings belong to the database; do not destroy
or retain them after `Database.destroy()`. `Engine.destroy()` also destroys its
database. Query condition strings are borrowed for execution.

`Engine.check_row` supports equality and ordering by value. Strings use lexical
byte order, not pointer comparison. Different value variants are unequal and
do not satisfy ordering predicates. Engine update retains a copy of the replacement before changing rows, so a
replacement borrowed from an affected row remains usable throughout the update;
delete releases row allocations. `execute` reports results to stdout unless
`silent` is true; it is a demo command interface, not a JSON query API.

`save(path)` writes a snapshot; `load(path)` loads one into an empty database.
Strings use `X:` followed by hex bytes, preserving spaces, newlines, quotes,
and UTF-8. Legacy `S:` strings are readable (legacy snapshots cannot preserve
spaces). Individual loaded records are limited to 1 MiB. This format is intended
for trusted local snapshots, has no transactions, locking, atomic writes, or
recovery journal, and does not support embedded NULs. Do not use it as a
concurrent or untrusted-import database. `save`/`load` print file-open errors;
malformed hex and invalid names raise exceptions.

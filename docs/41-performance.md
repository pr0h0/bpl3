# Performance Tips

Writing efficient BPL code.

## Memory

- Prefer stack allocation over heap allocation when possible.
- Pass large structs by pointer to avoid copying.

## Loops

- Minimize work inside loops.
- Use efficient algorithms.

## Incremental Builds

Use cached parallel builds for multi-module programs:

```bash
bpl build main.bpl --cache --jobs 4
```

To see whether the cache is doing useful work, add `--cache-stats`:

```bash
bpl build main.bpl --cache --jobs 4 --cache-stats
```

Example output:

```text
Executable created: ./main
Cache stats: modules=11 hits=8 misses=3 compiled=3 reused=8 jobs=4 sizeKb=304.64
```

High `hits` means unchanged module objects were reused. High `misses` after a
small edit usually means the changed module exposed a public ABI change, or the
module graph has more public coupling than intended.

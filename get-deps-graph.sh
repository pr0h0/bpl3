OUTPUT=deps.png
if [ -n "$2" ]; then
    OUTPUT=$2
fi

bun index.ts --deps $1 | dot -Tpng -o $OUTPUT
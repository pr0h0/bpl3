FROM oven/bun:1.4.2 AS bun
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
    clang-18 lld-18 libc6-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/clang-18 /usr/local/bin/clang \
    && ln -s /usr/bin/wasm-ld-18 /usr/local/bin/wasm-ld
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY compiler ./compiler
COPY cli ./cli
COPY grammar ./grammar
COPY lib ./lib
COPY index.ts ./
COPY playground/backend ./playground/backend
RUN cd lib && ./build_runtime.sh
ENV BPL_HOME=/app BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-cache
USER 10001:10001
WORKDIR /tmp
# PID 1 cannot be SIGSTOPped by submitted programs. Do not wrap this watchdog
# with --init: a same-UID child could then stop the watchdog and defeat its alarm.
# Exiting PID 1 tears down the entire PID namespace, including detached children.
ENTRYPOINT ["timeout", "--signal=KILL", "30s", "bun", "/app/playground/backend/worker.ts"]

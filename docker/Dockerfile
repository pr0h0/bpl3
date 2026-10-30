# syntax=docker/dockerfile:1
FROM oven/bun:1.4.2 AS bun
FROM docker:29.5.0-cli AS docker-cli

FROM ubuntu:24.04 AS compiler
ARG BPL_VERSION=0.1.1
ARG BPL_REVISION=local
LABEL org.opencontainers.image.source="https://github.com/pr0h0/bpl3" \
      org.opencontainers.image.version="${BPL_VERSION}" \
      org.opencontainers.image.revision="${BPL_REVISION}" \
      org.opencontainers.image.licenses="MIT"
RUN apt-get update && apt-get install -y --no-install-recommends \
    clang-18 lld-18 libclang-rt-18-dev libc6-dev ca-certificates libsqlite3-dev libsodium-dev libssl3t64 zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/clang-18 /usr/local/bin/clang \
    && ln -s /usr/bin/wasm-ld-18 /usr/local/bin/wasm-ld
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /opt/bpl
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
    && test "$(bun -p 'require("./package.json").version')" = "$BPL_VERSION" \
    && printf '%s\n' "$BPL_VERSION" | grep -Eq '^0\.1\.(0|[1-9][0-9]*)$'
COPY compiler ./compiler
COPY cli ./cli
COPY schemas ./schemas
COPY grammar ./grammar
COPY lib ./lib
COPY packages ./packages
COPY index.ts ./
COPY docker/bpl-entrypoint.sh /usr/local/bin/bpl
RUN chmod 755 /usr/local/bin/bpl && cd lib && ./build_runtime.sh
ENV HOME=/tmp BPL_HOME=/opt/bpl BUN_RUNTIME_TRANSPILER_CACHE_PATH=/tmp/bun-cache
RUN mkdir -p /work && chown 10001:10001 /work
USER 10001:10001
WORKDIR /work
ENTRYPOINT ["bpl"]
CMD ["--help"]

FROM compiler AS playground
ARG BPL_PLAYGROUND_IMAGE=bpl-playground:local
USER root
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY playground/backend /opt/bpl/playground/backend
COPY playground/frontend /opt/bpl/playground/frontend
COPY playground/examples /opt/bpl/playground/examples
COPY playground/tutorials /opt/bpl/playground/tutorials
COPY docker/playground-worker /usr/local/bin/bpl-playground-worker
RUN chmod 755 /usr/local/bin/bpl-playground-worker
ENV BPL_PLAYGROUND_RUNNER=docker \
    BPL_PLAYGROUND_HOST=0.0.0.0 \
    BPL_PLAYGROUND_IMAGE=${BPL_PLAYGROUND_IMAGE} \
    BPL_PLAYGROUND_WORKER_ENTRYPOINT=/usr/local/bin/bpl-playground-worker
USER 10001:10001
WORKDIR /tmp
EXPOSE 3001
ENTRYPOINT ["bun", "/opt/bpl/playground/backend/server.ts"]
CMD []

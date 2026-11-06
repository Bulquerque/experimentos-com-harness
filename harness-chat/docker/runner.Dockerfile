# Isolated executor. No NVIDIA key, no Docker socket and no host network access.
FROM node:22-bookworm-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python-is-python3 python3-numpy python3-sympy python3-scipy ca-certificates curl git unzip zstd && \
    rm -rf /var/lib/apt/lists/*
# Lean is installed at image build time. Runtime remains entirely offline.
ARG LEAN_VERSION=v4.24.0
ENV ELAN_HOME=/opt/elan
ENV PATH=/opt/elan/bin:$PATH
RUN mkdir -p "$ELAN_HOME" && \
    curl -fsSL --proto '=https' --tlsv1.2 https://elan.lean-lang.org/elan-init.sh | \
      sh -s -- -y --no-modify-path --default-toolchain "leanprover/lean4:${LEAN_VERSION}" && \
    chmod -R a+rX "$ELAN_HOME" && lean --version
WORKDIR /app
COPY --chown=node:node apps/runner/server.mjs ./server.mjs
COPY --chown=node:node docker/setup-mathlib.sh /opt/setup-mathlib.sh
RUN mkdir -p /workspace /run/harness && chown node:node /workspace && chown root:node /run/harness && chmod 0770 /run/harness
USER root
ENV HOME=/tmp NODE_ENV=production
EXPOSE 8790
CMD ["node","server.mjs"]

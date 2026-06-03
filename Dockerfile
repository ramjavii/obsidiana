# syntax=docker/dockerfile:1.7
# Bumped to rust:1.85 (was 1.79) because tauri-cli 2.0.0's transitive dep
# tree now includes crates whose Cargo.toml uses edition = "2024". That
# requires Cargo's edition2024 feature, which is only stable in Cargo
# >= 1.85. The project's own MSRV (1.75) is unchanged; this is only
# the dev image, and rust-toolchain.toml still says channel = "stable".
FROM rust:1.85-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20.18.0
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV CARGO_TERM_COLOR=always
ENV CARGO_INCREMENTAL=0

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    file \
    git \
    libayatana-appindicator3-dev \
    libgtk-3-dev \
    librsvg2-dev \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    patchelf \
    wget \
    xz-utils \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && node --version \
 && npm --version

RUN corepack enable \
 && corepack prepare pnpm@9.12.1 --activate \
 && pnpm --version

# Install tauri-cli by cloning the tauri monorepo at the v2.0.0 tag.
# vergen-gitcl (used by tauri-cli 2.x's build.rs) reads a build SHA via
# `git rev-parse --is-inside-work-tree`. The Docker build context excludes
# .git/ (see .dockerignore), so a `cargo install tauri-cli` from crates.io
# fails: the build happens in a temp dir with no .git/, vergen exits 1,
# and the whole RUN chain dies.
#
# Building from a git clone puts vergen inside a real .git/ tree, so
# git rev-parse succeeds and the build completes. --locked is dropped
# because the cloned repo's Cargo.lock is the source of truth.
RUN cargo install --git https://github.com/tauri-apps/tauri \
    --tag tauri-cli-v2.0.0 \
    tauri-cli \
 && which tauri \
 && tauri --version

WORKDIR /workspace

CMD ["bash"]

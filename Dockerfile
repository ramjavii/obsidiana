# syntax=docker/dockerfile:1.7
# Bumped to rust:1.88 because tauri-cli 2.0.0's transitive dep tree now
# pulls in crates that require rustc >= 1.88 (darling 0.23, home 0.5.12,
# image 0.25.10, serde_with 3.20, time 0.3.47) plus 1.87 (built 0.8.1)
# and 1.86 (icu_*, idna_adapter). Rust 1.79 (the original pin) was too
# old for edition2024; 1.85 was too old for the higher MSRVs. The
# project's own MSRV is still 1.75 and src-tauri/rust-toolchain.toml
# still pins channel = "stable"; this is only the dev image's Cargo.
FROM rust:1.88-bookworm

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

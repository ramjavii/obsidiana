# syntax=docker/dockerfile:1.7
FROM rust:1.79-bookworm

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

RUN cargo install tauri-cli --version "^2.0" --locked \
 && which tauri \
 && tauri --version

WORKDIR /workspace

CMD ["bash"]

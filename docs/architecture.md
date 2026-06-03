# OBSIDIANA — Architecture

> Living document. Updated on every feature commit (see AGENTS.md
> "Auto-Updating Docs Rule"). Read this alongside `MVP.md` and `spec.md`.

## Overview

OBSIDIANA is a local-first, single-user, cross-platform desktop Markdown
knowledge workspace built on Tauri v2 + Rust + React. Flat Markdown files
are the single source of truth; a SQLite index is a regenerable cache.

## Project Tree

```
obsidiana/
├── .devcontainer/
│   └── devcontainer.json                # VS Code Dev Containers, builds via docker-compose
├── .dockerignore
├── .env.example                         # placeholders for deferred integrations
├── .gitignore
├── .nvmrc                               # Node 20 LTS
├── .npmrc                               # node-linker=hoisted (Tauri 2 compat)
├── .obsidiana/                          # gitignored — runtime cache, never committed
├── AGENTS.md                            # AI agent rules (loaded every session)
├── Dockerfile                           # rust:1.88-bookworm + node 20 + pnpm + tauri-cli (git-installed)
├── docker-compose.yml                   # 'dev' service, mount project + persistent caches
├── docs/
│   ├── architecture.md                  # this file
│   └── toolchain.md                     # per-OS host install instructions
├── eslint.config.js                     # ESLint 9 flat config
├── index.html                           # Vite entry, <title>OBSIDIANA</title>
├── MVP.md                               # MVP plan & feature checkboxes
├── opencode.json                        # project-level AI agent config
├── package.json                         # pnpm scripts + deps
├── postcss.config.js
├── spec.md                              # technical spec
├── src/                                 # frontend (React 18 + TS strict + Tailwind)
│   ├── App.tsx                          # OBSIDIANA title + ping result + ?dev=1 error trigger
│   ├── components/
│   │   └── ToastHost.tsx                # global error/success/info toasts
│   ├── env.d.ts
│   ├── errors.ts                        # AppError TS discriminated union (mirrors Rust)
│   ├── hooks/
│   │   └── useToastStore.ts             # Zustand store + reportAppError() / reportError()
│   ├── ipc.ts                           # typed invoke() wrapper → IpcResult<T>
│   ├── main.tsx                         # React 18 createRoot + QueryClient + ToastHost
│   ├── styles.css                       # @tailwind base/components/utilities
│   └── __tests__/
│       ├── App.test.tsx                 # renders "OBSIDIANA", ping result, ?dev=1 trigger
│       ├── ToastHost.test.tsx           # push, dismiss, auto-TTL, stacking
│       ├── errors.test.ts               # isAppError, parseAppError, appErrorMessage
│       ├── ipc.test.ts                  # ok / AppError rejection / wrapped Internal
│       └── setup.ts                     # mocks @tauri-apps/api/core + renderWithProviders()
├── src-tauri/                           # backend (Rust 2021, Tauri 2)
│   ├── .gitignore                       # gen/, target/, WixTools/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json                 # core:default only — no fs/dialog plugins yet
│   ├── icons/                           # placeholder PNG/ICO; real icons come in polish pass
│   │   ├── 128x128.png
│   │   ├── 128x128@2x.png
│   │   ├── 32x32.png
│   │   ├── icon.ico
│   │   └── icon.png
│   ├── rust-toolchain.toml              # channel = "stable", rustfmt + clippy
│   ├── src/
│   │   ├── commands/
│   │   │   ├── error_demo.rs           # ping_or_fail: dev-only error-surface fixture
│   │   │   ├── mod.rs
│   │   │   └── ping.rs                  # smoke IPC command, returns "pong"
│   │   ├── error.rs                     # AppError enum (4 variants) + helpers + unit tests
│   │   ├── lib.rs                       # tauri::Builder, registers ping + ping_or_fail
│   │   └── main.rs                      # windows_subsystem = "windows" in release
│   ├── tauri.conf.json                  # identifier = "com.obsidiana.app"
│   └── tests/
│       └── ipc_smoke.rs                 # tauri::test::mock_app() + direct-call tests
├── tailwind.config.ts
├── tsconfig.json                        # strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
├── tsconfig.node.json                   # for vite/vitest/tailwind/eslint configs
├── vite.config.ts                       # @/ alias, port 1420, hmr 1421
└── vitest.config.ts                     # jsdom env, @/ alias, setupFiles
```

## Architectural Decisions

| Date       | Decision                                                                                                          | Rationale                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 2026-06-02 | Tauri v2 (not Electron) for the desktop shell.                                                                    | Minimal binary, low idle RAM, native WebView, Rust backend. See spec.md §2.1.                   |
| 2026-06-02 | SQLite (`rusqlite`) for the link/tag index; **no `sqlite-vec` in MVP**.                                            | Vector search is only useful once local AI lands. Defer until stage 6.                          |
| 2026-06-02 | Markdown source of truth; SQLite is a regenerable cache at `<vault>/.obsidiana/index.db`.                         | Vault remains portable, plain-text, readable in any editor. The index is disposable.             |
| 2026-06-02 | Git sync via CLI child process with explicit args array; `--ff-only` only.                                        | Avoids shell-injection; refuses destructive auto-merges. See spec.md §7.3.                       |
| 2026-06-02 | CodeMirror 6 in MVP — Source mode only. Live Preview and read-only Preview deferred.                              | Live Preview is a non-trivial renderer; ship Source first, add modes after the editor is solid. |
| 2026-06-02 | Local AI (Ollama, Whisper, MCP) and plugin runtime deferred past MVP.                                            | They need a hardened sandbox and a content model. Ship the core workspace first.                  |
| 2026-06-02 | Hand-rolled Tauri scaffold (no `pnpm create tauri-app`).                                                          | Interactive scaffolder ships opinionated templates that conflict with our stack rules.          |
| 2026-06-02 | Docker-based toolchain (`Dockerfile` + `docker-compose.yml` + `.devcontainer`).                                    | Host stays toolchain-less; CI and the agent use the same image; no "works on my machine" drift. |
| 2026-06-02 | pnpm 9 + Node 20 LTS + Rust 1.79 stable + Tauri CLI 2.x as the locked versions.                                    | Tauri 2 requires Node 20+ and Rust 1.75+; pnpm 9 is the current LTS line.                        |
| 2026-06-02 | App identifier `com.obsidiana.app`.                                                                                | Reverse-domain; used for macOS bundle ID, Windows AUMID, Linux desktop entry, OS app-data path. |
| 2026-06-02 | Minimal `AppError` enum in 1.1 (single `Internal` variant). Full enum in micro-feature 1.2.                        | Keeps 1.1 a pure scaffold; full error taxonomy is a focused next step.                          |
| 2026-06-02 | `ping` IPC command is a direct-call unit test in 1.1. Full `tauri::test::mock_app()` IPC test in 1.2+.            | The first IPC integration test with mock_app lands when we have meaningful state to test.        |
| 2026-06-02 | **AppError taxonomy in 1.2:** 4 variants — `Internal`, `NotFound`, `InvalidArgument`, `Io`. Full 12+ taxonomy grows incrementally. | Subset is enough for micro-features 1.3-1.5; each new IPC command adds its own variant.       |
| 2026-06-02 | **Frontend ↔ Rust error contract:** Rust `AppError` serializes as `{"kind": "Variant", "data": {...}}`. TS `AppError` is a discriminated union with `isAppError` / `parseAppError` / `appErrorMessage` helpers. | Single source of truth for both sides; drift is caught by `src/__tests__/errors.test.ts`.       |
| 2026-06-02 | **Typed IPC wrapper:** `ipcInvoke<T>(cmd, args) → IpcResult<T>` returns `{ok, value}` or `{ok: false, error, raw}` instead of throwing. | The TanStack Query layer can branch on `result.ok` without try/catch noise; toast hook is the only place that translates `AppError` → user-visible message. |
| 2026-06-02 | **Global toast surface:** single `<ToastHost>` mounted once in `main.tsx`, backed by a Zustand store. `useToastStore.push(kind, msg)` and `reportAppError(err)` are the only entry points. | No scattered toast components. The mutation `onError` in `QueryClient` is the default catch-all. |
| 2026-06-02 | **Dev-only error trigger:** `?dev=1` URL param reveals a "trigger AppError toast" button in `App.tsx` that invokes the Rust `ping_or_fail` command. The command is always registered (so the test path is real), but the frontend never calls it outside dev mode. | Lets us manually verify the toast path in the running app without waiting for a real error to happen. |
| 2026-06-02 | **First real `tauri::test::mock_app()` IPC test** in 1.2 (`src-tauri/tests/ipc_smoke.rs`): builds a mock app with the command registered, plus a direct-call round-trip and a JSON-shape assertion for the error path. | Establishes the test pattern every later `#[tauri::command]` will copy. |
| 2026-06-03 | **`tauri-cli` installed from git, not crates.io**, in the Docker image. Cloned at `--tag tauri-cli-v2.0.0` and `cargo install --path crates/tauri-cli`. The `.dockerignore` excludes `.git/`, so a crates.io install fails: `vergen-gitcl` (used by tauri-cli 2.x build.rs) runs `git rev-parse --is-inside-work-tree` and exits 1. | vergen needs a real `.git/` tree. The git-clone install puts the build inside a real working tree, so the build SHA can be resolved. |
| 2026-06-03 | **`tauri-cli` binary is `cargo-tauri`, not `tauri`.** | Tauri 2's CLI crate installs the executable as `cargo-tauri`. `pnpm tauri dev` and `cargo tauri` work because they shell out to `cargo-tauri`. Plain `tauri --version` does not. |

## Toolchain

Three equivalent workflows. Pick the one that matches your machine:

| Workflow       | Best for                                | How                                                                                                       |
| -------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Container**  | CI, the AI agent, any host with Docker. | `docker compose build dev && docker compose run --rm dev <cmd>`                                           |
| **Devcontainer** | VS Code users on any host.             | Install the Dev Containers extension, "Reopen in Container".                                              |
| **Host-native** | Iterative GUI dev with `pnpm tauri dev`. | Install Node 20 + pnpm + Rust 1.75+ + Linux Tauri deps (or macOS / Windows variants). See `docs/toolchain.md`. |

The Dockerfile is the source of truth. Devcontainer and host-native installs must produce the same tool versions. If they drift, fix the Dockerfile first.

## IPC Commands

See `spec.md` §4 for the full contract. Implemented so far:

- `ping` — smoke test. Returns `Ok("pong")`. No args. (micro-feature 1.1)
- `ping_or_fail` — dev-only error-surface fixture. Returns `Err(AppError::NotFound)`. Frontend must NOT call this unless `?dev=1` is in the URL. (micro-feature 1.2)

To be implemented (stages 1-5): all others from `spec.md` §4.

## Error surface

`AppError` is the single error type for every IPC command. It is
defined in `src-tauri/src/error.rs` as a `thiserror`-derived enum
with `#[serde(tag = "kind", content = "data")]` and serializes to:

```json
{ "kind": "Variant", "data": { ... } }
```

### Variants (current)

| Variant          | Data                              | Used by                                                  |
| ---------------- | --------------------------------- | -------------------------------------------------------- |
| `Internal`       | `{ message: string }`             | Catch-all for unexpected errors. Wraps `Error` toString. |
| `NotFound`       | `{ what: string }`                | File / vault / note not found.                            |
| `InvalidArgument`| `{ message: string }`             | Path validation failures (`..`, null bytes, escapes).    |
| `Io`             | `{ path: string, source: string }`| Wraps `std::io::Error` (the source message is sanitized).|

### Frontend contract

The TS mirror in `src/errors.ts` is a discriminated union of the
same shape. Three helpers:

- `isAppError(value)` — type guard, narrows `unknown` to `AppError`.
- `parseAppError(value)` — same but returns `AppError | null`.
- `appErrorMessage(err)` — human-readable message for the toast.

The typed wrapper in `src/ipc.ts` catches invoke rejections, parses
them through `isAppError`, and returns `IpcResult<T>`:

```ts
type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError; raw: unknown };
```

The TanStack Query mutation default `onError` (in `src/main.tsx`)
calls `reportError(message)`, which dispatches a toast. The
`ping_or_fail` command exercised through `?dev=1` is the manual
smoke test for this whole path.

## Database Schema

See `spec.md` §3. Tables: `documents`, `connections`, `tags`, `vault_meta`.
Index lives at `<vault>/.obsidiana/index.db` and is gitignored.

Schema migrations land with stage 3.

## Open Questions / Backlog

- Pick the Markdown engine: Rust `markdown-rs` crate vs. JS `remark-parse` in
  a Web Worker. Decide in the editor stage (MVP stage 2).
- Decide on `react-force-graph` 2D vs 3D mode at implementation time.
- Pick a settings file format: JSON is fine for MVP; TOML is also viable.
- Real icon set (designer assets). Current icons are placeholders generated
  by a Python script; a polish pass will replace them.
- Code signing, notarization, auto-update channel. Post-MVP.
- Cross-platform CI workflows (GitHub Actions) using the same Dockerfile.

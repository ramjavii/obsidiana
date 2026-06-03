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
│   ├── App.tsx                          # vault state router: <EmptyState> | <Shell> with <VaultSwitcher>
│   ├── components/
│   │   ├── EmptyState.tsx               # "Open vault…" full-window view (first launch)
│   │   ├── ToastHost.tsx                # global error/success/info toasts
│   │   └── VaultSwitcher.tsx            # header pill: current vault + recents + close
│   ├── env.d.ts
│   ├── errors.ts                        # AppError TS discriminated union (5 variants, mirrors Rust)
│   ├── hooks/
│   │   ├── useToastStore.ts             # Zustand store + reportAppError() / reportError()
│   │   └── useVault.ts                  # useVaultStatus + pick/open/close/force mutations
│   ├── ipc.ts                           # typed invoke() wrapper → IpcResult<T>
│   ├── ipc/
│   │   └── vault.ts                     # typed wrappers for pick/open/close/list_recent
│   ├── main.tsx                         # React 18 createRoot + QueryClient + ToastHost
│   ├── styles.css                       # @tailwind base/components/utilities
│   ├── types/
│   │   └── vault.ts                     # VaultInfo / RecentVault / VaultStatus shapes
│   └── __tests__/
│       ├── App.test.tsx                 # EmptyState + Shell + dev panel + ?dev=1 trigger
│       ├── EmptyState.test.tsx          # renders, click triggers pick_vault, surfaces error
│       ├── ToastHost.test.tsx           # push, dismiss, auto-TTL, stacking
│       ├── VaultSwitcher.test.tsx       # toggle, recents, close-vault click
│       ├── errors.test.ts               # isAppError, parseAppError, appErrorMessage (5 variants)
│       ├── ipc.test.ts                  # ok / AppError rejection / wrapped Internal
│       ├── useVault.test.tsx            # auto-open last vault, mutations reflect in status
│       └── setup.tsx                    # mocks @tauri-apps/api/core + renderWithProviders()
├── src-tauri/                           # backend (Rust 2021, Tauri 2)
│   ├── .gitignore                       # gen/, target/, WixTools/
│   ├── Cargo.toml                       # + tauri-plugin-dialog, dirs, chrono, tempfile
│   ├── build.rs
│   ├── capabilities/
│   │   └── default.json                 # core:default + dialog:default
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
│   │   │   ├── ping.rs                  # smoke IPC command, returns "pong"
│   │   │   └── vault.rs                 # pick_vault / open_vault[/_force] / close_vault / list_recent_vaults
│   │   ├── error.rs                     # AppError enum (5 variants) + helpers + unit tests
│   │   ├── lib.rs                       # tauri::Builder, registers plugin + AppState + handlers
│   │   ├── main.rs                      # windows_subsystem = "windows" in release
│   │   ├── paths.rs                     # app_data_dir, settings_path, canonicalize_dir, validate_relative_path
│   │   ├── settings.rs                  # Settings + RecentVaultEntry + Theme, JSON, atomic write
│   │   └── state.rs                     # AppState { vault: Mutex<Option<VaultHandle>>, settings_path }
│   ├── tauri.conf.json                  # identifier = "com.obsidiana.app"
│   └── tests/
│       ├── ipc_smoke.rs                 # tauri::test::mock_app() + direct-call tests
│       └── vault_lifecycle.rs           # 16 mock_app() tests for all 4 vault commands + AppError paths
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
| 2026-06-03 | **Settings file format: JSON.** Lives at `<os-app-data>/com.obsidiana.app/settings.json`. Atomic write via `.tmp` + rename. Schema version 1; unknown or corrupt files are quarantined as `settings.json.broken-<unix-ts>` and replaced with defaults. | JSON is the simplest portable format and matches the spec's mention of `settings.json`. No new dep. Quarantine + defaults per spec §6.2 ("never crash on bad index" / settings). |
| 2026-06-03 | **Vault root is the one absolute path the frontend may see.** All other paths returned by IPC are relative to the active vault and pass through `paths::validate_relative_path` (rejects `..`, null bytes, backslashes, absolute paths). | Spec §7.1 bans absolute paths from the frontend except for the picked vault root (needed for `list_recent_vaults` to be re-opened later). The exception is documented and the rule is enforced by lint-style comment in `commands/vault.rs`. |
| 2026-06-03 | **`open_vault` refuses to switch active vaults without `force: true`.** Emits `AppError::Busy`. The frontend uses `open_vault` (non-force) by default and `open_vault_force` only from the recents dropdown where the user explicitly chose to switch. | Prevents accidental vault loss from a stray double-click on Pick. Matches the spirit of spec §6.3 ("never destructive"). |

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
- `pick_vault` — opens the native folder picker via `tauri-plugin-dialog`. Returns `Ok(None)` if the user cancels; `Ok(Some(VaultInfo))` on pick (which also auto-opens the vault and persists it to settings). No args. (micro-feature 1.3)
- `open_vault(path)` — canonicalizes and validates the path; opens it as the active vault; refuses with `AppError::Busy` if another vault is already open. (micro-feature 1.3)
- `open_vault_force(path)` — same as `open_vault` but switches active vault even if one is already open. Called only from the recents dropdown. (micro-feature 1.3)
- `close_vault` — clears the active vault; idempotent (no-op if none open). Persists `last_vault = None`. (micro-feature 1.3)
- `list_recent_vaults` — reconciles (marks missing entries `available: false`) and returns the recents list. Persists after reconcile. (micro-feature 1.3)

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
| `Busy`           | `{ what: string }`                | A second conflicting action is already in flight. (micro-feature 1.3: `open_vault` when another vault is open.) |

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

## Vault lifecycle (micro-feature 1.3)

Stage 1 of MVP now has its first user-visible feature: the app
opens to an empty state, the user picks a folder, the folder is
persisted in `settings.json` as the active vault, and the app
remembers it on subsequent launches. The header shows a vault
switcher with a recents list (entries missing on disk are marked
`available: false`, never auto-purged).

### Backend layout

- `src-tauri/src/paths.rs` — `app_data_dir`, `settings_path`,
  `canonicalize_dir`, `validate_relative_path`. The last one
  rejects empty / null / `..` / absolute / backslash paths and
  is the single chokepoint enforcing spec §7.7.
- `src-tauri/src/settings.rs` — JSON `Settings` struct
  (`schema_ver`, `last_vault`, `recent_vaults`, `theme`,
  `window`) with `load` / `save` / `record_open` / `record_close`
  / `reconcile`. Atomic write via `.tmp` + rename. Corrupt or
  unknown-schema files are quarantined to
  `settings.json.broken-<unix-ts>` and replaced with defaults
  (spec §6.2 spirit).
- `src-tauri/src/state.rs` — `AppState { vault: Mutex<Option<VaultHandle>>, settings_path }`.
  `VaultHandle` carries the canonical path and the `opened_at`
  timestamp. Tauri-managed via `app.manage(...)` in `setup`.
- `src-tauri/src/commands/vault.rs` — the four spec §4.1 commands
  plus `open_vault_force`. Every command has a public `*_inner`
  helper that takes `tauri::State` directly so integration tests
  can call them without going through the IPC router (which
  requires the `AppHandle` `CommandArg` injection). The picker
  call is injected via a `FnOnce` closure so the dialog plugin is
  exercised in production and stubbed in tests.
- `src-tauri/tests/vault_lifecycle.rs` — 16 `tauri::test::mock_app()`
  tests covering the success and error path of every command:
  pick returns `None`, pick records open, pick propagates picker
  errors, pick rejects non-directories; open succeeds, open
  rejects nonexistent / file / empty / null-byte paths, open
  refuses without `force`, open force switches; close is
  idempotent, close persists; list returns empty, list marks
  missing entries unavailable; and a smoke test that the dialog
  plugin registers in a mock app.

### Frontend layout

- `src/ipc/vault.ts` — typed wrappers over `ipcInvoke` that throw
  on error (callers consume the rejection or the toast via
  `useVaultMutation`).
- `src/hooks/useVault.ts` — `useVaultStatus` runs on mount,
  calls `list_recent_vaults`, auto-opens the first available
  recent. `usePickVaultMutation`, `useOpenVaultMutation`,
  `useOpenVaultForceMutation`, `useCloseVaultMutation` all
  invalidate `["vault","status"]` on success and surface
  `AppError` rejections via `reportAppError`.
- `src/components/EmptyState.tsx` — full-window "No vault open"
  view with a single "Open vault…" button.
- `src/components/VaultSwitcher.tsx` — header pill: current
  vault name, click to open a dropdown with recents, "Switch
  vault…", and "Close vault". Recents marked unavailable are
  disabled.
- `src/App.tsx` — routes between `<EmptyState />` and `<Shell>`.
  The dev-only `?dev=1` panel is mounted only inside `<Shell>`,
  so it only appears once a vault is open.

### Sandbox boundary exception

`spec.md` §7.1 says the frontend never sees absolute paths.
The one exception is the **vault root**, returned by `pick_vault`
/ `open_vault` as `VaultInfo.path` so the recents list can be
re-opened on subsequent launches. Every other path returned by
IPC is relative to the active vault and goes through
`validate_relative_path`. The exception is enforced by a
`// SAFETY: vault root is the one absolute path...` comment on
`vault_info_from` so a future grep finds it.

## Database Schema

See `spec.md` §3. Tables: `documents`, `connections`, `tags`, `vault_meta`.
Index lives at `<vault>/.obsidiana/index.db` and is gitignored.

Schema migrations land with stage 3.

## Open Questions / Backlog

- Pick the Markdown engine: Rust `markdown-rs` crate vs. JS `remark-parse` in
  a Web Worker. Decide in the editor stage (MVP stage 2).
- Decide on `react-force-graph` 2D vs 3D mode at implementation time.
- ~~Pick a settings file format: JSON is fine for MVP; TOML is also viable.~~ Resolved 2026-06-03 — JSON.
- Real icon set (designer assets). Current icons are placeholders generated
  by a Python script; a polish pass will replace them.
- Code signing, notarization, auto-update channel. Post-MVP.
- Cross-platform CI workflows (GitHub Actions) using the same Dockerfile.

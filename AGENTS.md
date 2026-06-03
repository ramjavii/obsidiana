# AGENTS.md — OBSIDIANA

This file governs how AI agents (opencode, feature-loop) work on this codebase.
It is loaded by opencode on every session. Keep it concrete and current.

## Tech Stack Enforcement

These are hard rules. Do not propose alternatives without a written ADR in
`/docs/architecture.md`.

- **Shell:** Tauri v2 only. The desktop binary is a Tauri app. No Electron.
- **Backend:** Rust, edition 2021. All filesystem, indexing, watcher, and Git
  operations go through Rust commands invoked via Tauri IPC. The frontend
  must never call `std::fs` equivalents (no `fs-extra`, no `node:fs` reads of
  vault files).
- **Frontend:** React 18 + TypeScript (strict mode on) + Vite.
- **Styling:** Tailwind CSS only. No external UI kits (no MUI, no Chakra,
  no Mantine, no Bootstrap). Build primitives by hand.
- **Editor:** CodeMirror 6. No Monaco, no Slate, no Lexical.
- **Database:** SQLite via `rusqlite`. Single bundled DB. No `sqlite-vec` in
  MVP. No Postgres, no DuckDB, no RxDB.
- **Markdown engine:** `remark-parse` (via the Rust `markdown` crate or a JS
  pipeline that runs in a Web Worker — pick one and document it).
- **Filesystem watcher:** `notify` crate, 200 ms debounce, ignore self-writes.
- **Graph rendering:** `react-force-graph` with Canvas backend.
- **Git:** invoke the `git` CLI as a child process with an args array, never
  via a shell string. Working directory is the vault root, set per call.
- **State management:** Zustand for UI state. React Query (TanStack) for
  IPC data fetching. No Redux, no MobX, no Recoil.
- **Package manager:** pnpm for the frontend, Cargo for Rust. Do not mix.
- **Node version:** 20 LTS. Document in `.nvmrc` when the frontend is scaffolded.
- **Rust version:** stable, MSRV 1.75. Document in `rust-toolchain.toml` when
  the backend is scaffolded.

## Code Style Preferences

- **TypeScript:** strict mode, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`. Prefer `type` aliases over `interface`
  unless declaration merging is needed. No `any`; use `unknown` and narrow.
- **React:** functional components only. No class components. Arrow functions
  for component definitions. Hooks at the top level; no conditional hooks.
- **Async:** `async/await` end-to-end. No raw `.then()` chains in app code
  (allowed inside one-off scripts and tests).
- **Naming:** `PascalCase` for components and types, `camelCase` for
  variables and functions, `SCREAMING_SNAKE_CASE` for module-level constants.
  File names mirror the default export: `FileTree.tsx`, `useDebouncedSave.ts`.
- **Imports:** absolute imports via the `@/` alias mapped to `src/`. Group:
  1. external, 2. internal, 3. types, 4. styles. One blank line between groups.
- **Rust:** standard `rustfmt` formatting. `clippy::pedantic` lints as warnings.
  Prefer `?` over `match` for error propagation. Use `thiserror` for error
  types; never `unwrap()` in non-test code.
- **Comments:** do not add comments unless they explain *why*, not *what*.
  No banner comments, no section dividers.
- **Emojis:** never in code, comments, commit messages, or docs.

## Error Handling Rules

- Every Tauri IPC command returns `Result<T, AppError>`. `AppError` is a
  `thiserror`-derived enum with `#[serde(tag = "kind", content = "data")]`
  so the frontend can pattern-match without parsing strings.
- The frontend wraps every IPC call in a typed `useQuery` / `useMutation`
  hook from TanStack Query. The hook's `onError` surfaces the error via a
  single global toast component.
- Rust commands that touch the filesystem wrap their body in
  `tokio::task::spawn_blocking` so the IPC thread is never blocked on I/O.
- The watcher, indexer, and preprocessor all run on dedicated worker threads
  or async tasks; their errors are logged to a centralized ring buffer
  exposed via an `index_status` IPC command — they never crash the app.
- Markdown-to-HTML rendering sanitizes its output. Any HTML containing
  `<script>`, `on*` attributes, or `javascript:` URLs is dropped, and the
  sanitization event is logged.
- Git operations are guarded by an in-process mutex. A second `git_pull`
  while one is in flight returns `AppError::Busy` and a UI toast.
- The app must never `panic!` on user input. Every `unwrap()` in production
  code is a bug.

## Auto-Updating Docs Rule

Whenever you create a new feature, directory, or API route, you must
immediately update `/docs/architecture.md` with:

1. A one-paragraph summary of the change (what it does, why it exists).
2. An updated tree structure of the files you touched (use `tree` or
   hand-rolled indentation; do not commit node_modules or target/).
3. A bullet list of new IPC commands, schema migrations, or schema tables,
   each linking back to the corresponding section in `spec.md`.

Do this in the same commit as the code change. A commit that adds code
without updating `docs/architecture.md` is incomplete.

## Testing Discipline

- TDD: write the failing test first for every non-trivial behavior. The
  failing test defines the contract; the code that makes it pass is the
  implementation.
- Rust: `cargo test` for unit tests, `cargo test --test integration` for
  IPC-level integration tests using `tauri::test::mock_app()`.
- Frontend: `vitest` for unit and component tests, `playwright` for E2E
  flows (file tree, editor save, graph open).
- Every `#[tauri::command]` must have at least one IPC integration test
  that exercises the success path and one that exercises the documented
  error path.

## Workflow Reminder

For non-trivial code changes, the operating model is the `feature-loop`
skill:

1. Prime with `MVP.md`, `spec.md`, and `docs/architecture.md`.
2. Pick ONE micro-feature.
3. Plan (MVP-aware: keep the current stage's scope).
4. TDD execute.
5. Validate with `/test` and `/lint`.
6. Conventional commit.
7. Sync `docs/architecture.md` and `MVP.md` (tick the checkbox only after
   the feature is delivered *and* verified).

Do not bundle multiple micro-features into one commit. Do not mark a
checkbox as `- [x]` until the feature is verified end-to-end.

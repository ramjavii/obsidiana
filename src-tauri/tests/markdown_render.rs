use chrono::Utc;
use obsidiana_lib::commands::markdown;
use obsidiana_lib::error::AppError;
use obsidiana_lib::state::{AppState, VaultHandle};
use std::path::{Path, PathBuf};
use tauri::test::{mock_builder, mock_context, noop_assets};
use tauri::Manager;

fn build_app_with_vault(vault_dir: &Path) -> tauri::App<tauri::test::MockRuntime> {
    let canonical = std::fs::canonicalize(vault_dir).expect("canonicalize vault");
    let settings_path = vault_dir
        .parent()
        .map(|p| p.join("settings.json"))
        .unwrap_or_else(|| PathBuf::from("settings.json"));
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    let state = AppState::new(settings_path);
    {
        let mut guard = state.vault.lock().expect("lock");
        *guard = Some(VaultHandle {
            path: canonical,
            opened_at: Utc::now(),
        });
    }
    app.manage(state);
    app
}

fn write_note(root: &Path, rel: &str, content: &str) {
    let p = root.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).expect("create parents");
    }
    std::fs::write(&p, content).expect("write");
}

fn render(path: &str, state: tauri::State<'_, AppState>) -> serde_json::Value {
    let note = markdown::render_markdown_inner(state, path.to_string()).expect("render");
    serde_json::to_value(&note).expect("serialize")
}

#[test]
fn render_markdown_returns_html_and_spans_for_a_simple_note() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "note.md", "**bold** and *italic*\n");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();

    let v = render("note.md", state);
    let html = v.get("html").and_then(|x| x.as_str()).expect("html");
    assert!(html.contains("<strong>bold</strong>"));
    assert!(html.contains("<em>italic</em>"));
    let spans = v
        .get("inlineSpans")
        .and_then(|x| x.as_array())
        .expect("inlineSpans");
    let has_strong = spans.iter().any(|s| {
        s.get("kind")
            .and_then(|k| k.get("kind"))
            .and_then(|k| k.as_str())
            == Some("strong")
    });
    let has_em = spans.iter().any(|s| {
        s.get("kind")
            .and_then(|k| k.get("kind"))
            .and_then(|k| k.as_str())
            == Some("emphasis")
    });
    assert!(has_strong, "missing strong span: {spans:?}");
    assert!(has_em, "missing emphasis span: {spans:?}");
}

#[test]
fn render_markdown_rejects_dotdot_path() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();

    let err =
        markdown::render_markdown_inner(state, "../outside.md".to_string()).expect_err("..");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn render_markdown_rejects_missing_file() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();

    let err =
        markdown::render_markdown_inner(state, "nope.md".to_string()).expect_err("missing");
    assert!(matches!(err, AppError::NotFound { .. }));
}

#[test]
fn render_markdown_rejects_when_no_vault_open() {
    let app = mock_builder()
        .build(mock_context(noop_assets()))
        .expect("mock app should build");
    let state = AppState::new(PathBuf::from("/tmp/settings.json"));
    app.manage(state);
    let state_ref = app.state::<AppState>();

    let err = markdown::render_markdown_inner(state_ref, "note.md".to_string())
        .expect_err("no vault");
    assert!(matches!(err, AppError::InvalidArgument { .. }));
}

#[test]
fn render_markdown_strips_dangerous_html() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(
        &vault,
        "note.md",
        "hi <script>alert(1)</script>\n\n[bad](javascript:alert(1))\n",
    );
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();

    let v = render("note.md", state);
    let html = v.get("html").and_then(|x| x.as_str()).expect("html");
    assert!(!html.contains("<script>"), "raw <script> in html: {html}");
    assert!(!html.contains("</script>"), "raw </script> in html: {html}");
    assert!(!html.contains("javascript:"), "javascript: in html: {html}");
    assert!(
        !html.contains("onerror") && !html.contains("onclick"),
        "event handler in html: {html}"
    );
}

#[test]
fn render_markdown_emits_resolved_wikilink_spans() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "target.md", "target body");
    write_note(&vault, "note.md", "see [[target]] here\n");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();

    let v = render("note.md", state);
    let spans = v
        .get("inlineSpans")
        .and_then(|x| x.as_array())
        .expect("inlineSpans");
    let resolved = spans.iter().find(|s| {
        s.get("kind")
            .and_then(|k| k.get("kind"))
            .and_then(|k| k.as_str())
            == Some("wikilinkResolved")
    });
    assert!(resolved.is_some(), "expected wikilinkResolved, got {spans:?}");
}

#[test]
fn render_markdown_omits_span_for_broken_wikilink() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = tmp.path().join("vault");
    std::fs::create_dir(&vault).expect("mkdir");
    write_note(&vault, "note.md", "see [[missing]] here\n");
    let app = build_app_with_vault(&vault);
    let state = app.state::<AppState>();

    let v = render("note.md", state);
    let spans = v
        .get("inlineSpans")
        .and_then(|x| x.as_array())
        .expect("inlineSpans");
    let resolved = spans.iter().find(|s| {
        s.get("kind")
            .and_then(|k| k.get("kind"))
            .and_then(|k| k.as_str())
            == Some("wikilinkResolved")
    });
    assert!(resolved.is_none(), "broken wikilink must not produce a span");
}

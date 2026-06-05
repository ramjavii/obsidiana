use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::markdown::types::ResolvedLink;
use crate::paths::validate_relative_path;

fn has_note_extension(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn file_stem(name: &str) -> &str {
    match name.rfind('.') {
        Some(idx) => &name[..idx],
        None => name,
    }
}

fn normalize_slashes(s: &str) -> String {
    s.replace('\\', "/")
}

fn to_forward_relative(raw: &Path) -> PathBuf {
    let s = raw.to_string_lossy();
    PathBuf::from(normalize_slashes(s.as_ref()))
}

fn parent_dir_of(relative: &Path) -> PathBuf {
    match relative.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::new(),
    }
}

fn path_distance(source_dir: &Path, candidate: &Path) -> usize {
    let source_parts: Vec<String> = source_dir
        .iter()
        .map(|c| c.to_string_lossy().into_owned())
        .collect();
    let candidate_parts: Vec<String> = candidate
        .iter()
        .map(|c| c.to_string_lossy().into_owned())
        .collect();

    let common = source_parts
        .iter()
        .zip(candidate_parts.iter())
        .take_while(|(a, b)| a == b)
        .count();
    let up = source_parts.len() - common;
    let down = candidate_parts.len() - common;
    up + down
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn is_candidate_visible(rel: &Path) -> bool {
    rel.iter().all(|c| !is_hidden(&c.to_string_lossy()))
}

fn build_relative(root: &Path, absolute: &Path) -> Option<PathBuf> {
    absolute.strip_prefix(root).ok().map(to_forward_relative)
}

fn collect_candidates(root: &Path) -> AppResult<Vec<PathBuf>> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let read = std::fs::read_dir(&dir)
            .map_err(|e| AppError::from_io(dir.display().to_string(), &e))?;
        for entry in read {
            let entry = entry.map_err(|e| AppError::from_io(dir.display().to_string(), &e))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_hidden(&name) {
                continue;
            }
            let file_type = entry
                .file_type()
                .map_err(|e| AppError::from_io(dir.display().to_string(), &e))?;
            let path = entry.path();
            if file_type.is_dir() {
                stack.push(path);
            } else             if file_type.is_file() && has_note_extension(&name) {
                if let Some(rel) = build_relative(root, &path) {
                    if is_candidate_visible(&rel) {
                        out.push(rel);
                    }
                }
            }
        }
    }
    Ok(out)
}

fn stem_match(rel: &Path, target_stem: &str) -> bool {
    let Some(file_name) = rel.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    file_stem(file_name).eq_ignore_ascii_case(target_stem)
}

fn try_path_style(root: &Path, name_raw: &str) -> Vec<PathBuf> {
    let mut hits = Vec::new();
    let candidates: Vec<String> = if has_note_extension(name_raw) {
        vec![normalize_slashes(name_raw)]
    } else {
        let trimmed = normalize_slashes(name_raw).trim_end_matches('/').to_string();
        vec![
            format!("{trimmed}.md"),
            format!("{trimmed}.markdown"),
        ]
    };
    for candidate in candidates {
        let path = root.join(&candidate);
        let meta = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        let rel = match build_relative(root, &path) {
            Some(r) => r,
            None => continue,
        };
        if !is_candidate_visible(&rel) {
            continue;
        }
        hits.push(rel);
    }
    hits
}

fn try_bare_name(root: &Path, target_stem: &str, source_dir: &Path) -> AppResult<Vec<PathBuf>> {
    let all = collect_candidates(root)?;
    let mut hits = Vec::new();
    for rel in all {
        if stem_match(&rel, target_stem) {
            let candidate_dir = parent_dir_of(&rel);
            let _ = path_distance(source_dir, &candidate_dir);
            hits.push(rel);
        }
    }
    Ok(hits)
}

fn pick_shortest(source_dir: &Path, hits: Vec<PathBuf>) -> Option<PathBuf> {
    hits.into_iter()
        .min_by(|a, b| {
            let da = path_distance(source_dir, &parent_dir_of(a));
            let db = path_distance(source_dir, &parent_dir_of(b));
            da.cmp(&db).then_with(|| {
                let a_str = normalize_slashes(&a.to_string_lossy());
                let b_str = normalize_slashes(&b.to_string_lossy());
                a_str.cmp(&b_str)
            })
        })
}

pub fn resolve_wikilink(
    vault_root: &Path,
    source_path: &Path,
    target: &str,
    alias: Option<&str>,
) -> AppResult<ResolvedLink> {
    let target = target.trim();
    if target.is_empty() {
        return Err(AppError::invalid("wikilink target is empty"));
    }

    let (name_raw, section) = match target.split_once('#') {
        Some((n, s)) => {
            let sec = s.trim();
            (n.trim(), if sec.is_empty() { None } else { Some(sec.to_string()) })
        }
        None => (target, None),
    };

    if name_raw.is_empty() {
        return Err(AppError::invalid("wikilink target has no name before '#'"));
    }

    if name_raw.contains("..") || name_raw.starts_with('/') || name_raw.starts_with('\\') {
        return Err(AppError::invalid(format!(
            "wikilink target escapes vault: {name_raw}"
        )));
    }

    let _ = validate_relative_path(name_raw).map_err(|e| match e {
        AppError::InvalidArgument { message } => AppError::invalid(format!(
            "wikilink target invalid: {message}"
        )),
        other => other,
    })?;

    let alias_opt = alias
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);

    let source_dir = parent_dir_of(source_path);
    let hits = if name_raw.contains('/') {
        try_path_style(vault_root, name_raw)
    } else {
        try_bare_name(vault_root, name_raw, &source_dir)?
    };

    let source_path_str = normalize_slashes(&source_path.to_string_lossy());

    let chosen = pick_shortest(&source_dir, hits);

    match chosen {
        Some(resolved) => Ok(ResolvedLink::Resolved {
            target: target.to_string(),
            source_path: source_path_str,
            resolved_path: normalize_slashes(&resolved.to_string_lossy()),
            section,
            alias: alias_opt,
        }),
        None => Ok(ResolvedLink::Broken {
            target: target.to_string(),
            source_path: source_path_str,
            section,
            alias: alias_opt,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn make_vault() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().join("vault");
        std::fs::create_dir(&root).expect("mkdir");
        (tmp, root)
    }

    fn write_note(root: &Path, rel: &str) {
        let p = root.join(rel);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).expect("create parents");
        }
        std::fs::write(&p, b"# test\n").expect("write");
    }

    #[test]
    fn helper_has_note_extension_matches_markdown_variants() {
        assert!(has_note_extension("a.md"));
        assert!(has_note_extension("A.MD"));
        assert!(has_note_extension("a.markdown"));
        assert!(has_note_extension("README.Markdown"));
        assert!(!has_note_extension("a.txt"));
        assert!(!has_note_extension("a"));
    }

    #[test]
    fn helper_file_stem_strips_only_last_extension() {
        assert_eq!(file_stem("note.md"), "note");
        assert_eq!(file_stem("archive/old-idea.markdown"), "archive/old-idea");
        assert_eq!(file_stem("noext"), "noext");
    }

    #[test]
    fn helper_path_distance_is_sum_of_up_and_down() {
        let source = Path::new("notes");
        let same = Path::new("notes");
        assert_eq!(path_distance(source, same), 0);
        let nested = Path::new("notes/inner");
        assert_eq!(path_distance(source, nested), 1);
        let sibling = Path::new("archive");
        assert_eq!(path_distance(source, sibling), 2);
        let deep_sibling = Path::new("archive/old");
        assert_eq!(path_distance(source, deep_sibling), 3);
    }

    #[test]
    fn helper_parent_dir_of_handles_root_and_nested() {
        assert_eq!(parent_dir_of(Path::new("note.md")), PathBuf::new());
        assert_eq!(parent_dir_of(Path::new("notes/a.md")), PathBuf::from("notes"));
        assert_eq!(
            parent_dir_of(Path::new("a/b/c.md")),
            PathBuf::from("a/b")
        );
    }

    #[test]
    fn helper_is_candidate_visible_skips_dot_segments() {
        assert!(is_candidate_visible(Path::new("notes/a.md")));
        assert!(!is_candidate_visible(Path::new(".obsidian/x.md")));
        assert!(!is_candidate_visible(Path::new("notes/.hidden/a.md")));
    }

    #[test]
    fn bare_name_single_candidate_resolves() {
        let (_tmp, root) = make_vault();
        write_note(&root, "idea.md");
        let result = resolve_wikilink(&root, Path::new("source.md"), "idea", None)
            .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "idea.md");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn bare_name_zero_candidates_returns_broken() {
        let (_tmp, root) = make_vault();
        let result = resolve_wikilink(&root, Path::new("source.md"), "ghost", None)
            .expect("ok");
        assert!(matches!(result, ResolvedLink::Broken { .. }));
    }

    #[test]
    fn bare_name_picks_nearest_when_multiple_candidates_exist() {
        let (_tmp, root) = make_vault();
        write_note(&root, "notes/idea.md");
        write_note(&root, "archive/idea.md");
        let result = resolve_wikilink(&root, Path::new("notes/source.md"), "idea", None)
            .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "notes/idea.md");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn bare_name_ties_broken_alphabetically() {
        let (_tmp, root) = make_vault();
        write_note(&root, "a/idea.md");
        write_note(&root, "b/idea.md");
        let result = resolve_wikilink(&root, Path::new("c.md"), "idea", None)
            .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "a/idea.md");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn bare_name_is_case_insensitive() {
        let (_tmp, root) = make_vault();
        write_note(&root, "Idea.md");
        let result = resolve_wikilink(&root, Path::new("source.md"), "idea", None)
            .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "Idea.md");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn path_style_resolves_with_automatic_md_extension() {
        let (_tmp, root) = make_vault();
        write_note(&root, "folder/note.md");
        let result =
            resolve_wikilink(&root, Path::new("source.md"), "folder/note", None)
                .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "folder/note.md");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn path_style_resolves_with_explicit_md_extension() {
        let (_tmp, root) = make_vault();
        write_note(&root, "folder/note.md");
        let result =
            resolve_wikilink(&root, Path::new("source.md"), "folder/note.md", None)
                .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "folder/note.md");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn path_style_resolves_with_markdown_extension() {
        let (_tmp, root) = make_vault();
        write_note(&root, "readme.markdown");
        let result = resolve_wikilink(&root, Path::new("source.md"), "readme", None)
            .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "readme.markdown");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn path_style_missing_target_returns_broken() {
        let (_tmp, root) = make_vault();
        let result =
            resolve_wikilink(&root, Path::new("source.md"), "folder/ghost", None)
                .expect("ok");
        assert!(matches!(result, ResolvedLink::Broken { .. }));
    }

    #[test]
    fn target_with_section_returns_section_field() {
        let (_tmp, root) = make_vault();
        write_note(&root, "note.md");
        let result =
            resolve_wikilink(&root, Path::new("source.md"), "note#Section", None)
                .expect("ok");
        match result {
            ResolvedLink::Resolved { section, .. } => {
                assert_eq!(section.as_deref(), Some("Section"));
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn target_with_section_on_broken_link_keeps_section() {
        let (_tmp, root) = make_vault();
        let result =
            resolve_wikilink(&root, Path::new("source.md"), "ghost#Sec", None)
                .expect("ok");
        match result {
            ResolvedLink::Broken { section, .. } => {
                assert_eq!(section.as_deref(), Some("Sec"));
            }
            other => panic!("expected Broken, got {other:?}"),
        }
    }

    #[test]
    fn alias_is_echoed_back() {
        let (_tmp, root) = make_vault();
        write_note(&root, "idea.md");
        let result = resolve_wikilink(&root, Path::new("source.md"), "idea", Some("My Idea"))
            .expect("ok");
        match result {
            ResolvedLink::Resolved { alias, .. } => {
                assert_eq!(alias.as_deref(), Some("My Idea"));
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }

    #[test]
    fn empty_target_is_rejected() {
        let (_tmp, root) = make_vault();
        let err = resolve_wikilink(&root, Path::new("source.md"), "", None)
            .expect_err("should reject");
        assert!(matches!(err, AppError::InvalidArgument { .. }));
    }

    #[test]
    fn section_only_target_is_rejected() {
        let (_tmp, root) = make_vault();
        let err = resolve_wikilink(&root, Path::new("source.md"), "#Section", None)
            .expect_err("should reject");
        assert!(matches!(err, AppError::InvalidArgument { .. }));
    }

    #[test]
    fn target_with_parent_traversal_is_rejected() {
        let (_tmp, root) = make_vault();
        let err = resolve_wikilink(&root, Path::new("source.md"), "../escape", None)
            .expect_err("should reject");
        assert!(matches!(err, AppError::InvalidArgument { .. }));
    }

    #[test]
    fn target_with_absolute_path_is_rejected() {
        let (_tmp, root) = make_vault();
        let err = resolve_wikilink(&root, Path::new("source.md"), "/etc/passwd", None)
            .expect_err("should reject");
        assert!(matches!(err, AppError::InvalidArgument { .. }));
    }

    #[test]
    fn hidden_files_are_not_considered_as_candidates() {
        let (_tmp, root) = make_vault();
        write_note(&root, ".obsidian/idea.md");
        let result = resolve_wikilink(&root, Path::new("source.md"), "idea", None)
            .expect("ok");
        assert!(matches!(result, ResolvedLink::Broken { .. }));
    }

    #[test]
    fn source_in_subfolder_picks_closer_sibling() {
        let (_tmp, root) = make_vault();
        write_note(&root, "notes/inner/idea.md");
        write_note(&root, "archive/idea.md");
        let result = resolve_wikilink(
            &root,
            Path::new("notes/inner/source.md"),
            "idea",
            None,
        )
        .expect("ok");
        match result {
            ResolvedLink::Resolved { resolved_path, .. } => {
                assert_eq!(resolved_path, "notes/inner/idea.md");
            }
            other => panic!("expected Resolved, got {other:?}"),
        }
    }
}

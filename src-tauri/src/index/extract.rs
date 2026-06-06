use std::sync::OnceLock;

use regex::Regex;

static H1_RE: OnceLock<Regex> = OnceLock::new();

fn h1_re() -> &'static Regex {
    H1_RE.get_or_init(|| {
        Regex::new(r"(?m)^#[ \t]+(.+?)[ \t]*$").expect("valid h1 regex")
    })
}

fn is_fence_marker(line: &str) -> bool {
    line.trim_start().starts_with("```") || line.trim_start().starts_with("~~~")
}

pub fn extract_title(content: &str, fallback_filename: &str) -> String {
    let mut in_fence = false;
    for line in content.lines() {
        if is_fence_marker(line) {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if let Some(cap) = h1_re().captures(line) {
            if let Some(m) = cap.get(1) {
                return m.as_str().trim().to_string();
            }
        }
    }
    fallback_filename.to_string()
}

pub fn content_hash(content: &str) -> String {
    let digest = blake3::hash(content.as_bytes());
    let hex = digest.to_hex();
    hex.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_uses_h1_when_present() {
        let content = "# Hello world\n\nbody\n";
        assert_eq!(extract_title(content, "fallback.md"), "Hello world");
    }

    #[test]
    fn title_h1_is_trimmed() {
        let content = "#    spaced out   \n";
        assert_eq!(extract_title(content, "fallback.md"), "spaced out");
    }

    #[test]
    fn title_uses_first_h1_when_multiple() {
        let content = "# First\n\n## Second\n\n# Third\n";
        assert_eq!(extract_title(content, "fallback.md"), "First");
    }

    #[test]
    fn title_skips_h1_inside_fenced_code() {
        let content = "```\n# Not a title\n```\n\n# Real title\n";
        assert_eq!(extract_title(content, "fallback.md"), "Real title");
    }

    #[test]
    fn title_falls_back_to_filename_when_no_h1() {
        let content = "## only h2 here\n\nbody\n";
        assert_eq!(extract_title(content, "idea.md"), "idea.md");
    }

    #[test]
    fn title_falls_back_to_filename_on_empty_content() {
        assert_eq!(extract_title("", "empty.md"), "empty.md");
    }

    #[test]
    fn title_skips_setext_heading_underline() {
        let content = "Not a heading\n=============\n\n# Real\n";
        assert_eq!(extract_title(content, "x.md"), "Real");
    }

    #[test]
    fn content_hash_is_deterministic() {
        let a = content_hash("hello world");
        let b = content_hash("hello world");
        assert_eq!(a, b);
    }

    #[test]
    fn content_hash_is_different_for_different_content() {
        let a = content_hash("hello");
        let b = content_hash("world");
        assert_ne!(a, b);
    }

    #[test]
    fn content_hash_is_different_for_one_byte_change() {
        let a = content_hash("hello world");
        let b = content_hash("hello worlD");
        assert_ne!(a, b);
    }
}

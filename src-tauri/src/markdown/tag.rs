use super::types::TagRef;
use std::sync::OnceLock;

use regex::Regex;

static TAG_RE: OnceLock<Regex> = OnceLock::new();

fn tag_re() -> &'static Regex {
    TAG_RE.get_or_init(|| {
        Regex::new(r"(?:^|[\s(\[])#([A-Za-z0-9_/-]+)")
            .expect("valid tag regex")
    })
}

pub fn extract_tags(content: &str) -> Vec<TagRef> {
    let re = tag_re();
    let mut out = Vec::new();
    for cap in re.captures_iter(content) {
        let m = cap.get(0).expect("group 0 always present");
        let name_match = cap.get(1).expect("group 1 always present");
        let name = name_match.as_str();
        if name.is_empty() {
            continue;
        }
        let line = content[..m.start()].bytes().filter(|&b| b == b'\n').count() + 1;
        out.push(TagRef {
            name: name.to_string(),
            line,
        });
    }
    out
}

pub fn extract_tags_from_wikilinks(content: &str) -> Vec<TagRef> {
    let mut out = Vec::new();
    for (line_idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if !trimmed.to_lowercase().starts_with("tags:") {
            continue;
        }
        let after_colon = &trimmed["tags:".len()..].trim();
        if after_colon.is_empty() {
            continue;
        }
        for m in crate::markdown::wikilink::wikilink_ranges(after_colon) {
            out.push(TagRef {
                name: m.target,
                line: line_idx + 1,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_content_returns_no_tags() {
        assert_eq!(extract_tags(""), vec![]);
    }

    #[test]
    fn single_tag_at_start_of_line() {
        let result = extract_tags("#idea is cool");
        assert_eq!(
            result,
            vec![TagRef {
                name: "idea".to_string(),
                line: 1,
            }]
        );
    }

    #[test]
    fn tag_after_whitespace_in_middle_of_line() {
        let result = extract_tags("hello #world");
        assert_eq!(
            result,
            vec![TagRef {
                name: "world".to_string(),
                line: 1,
            }]
        );
    }

    #[test]
    fn multiple_tags_on_same_line() {
        let result = extract_tags("#alpha and #beta and #gamma");
        assert_eq!(
            result,
            vec![
                TagRef { name: "alpha".to_string(), line: 1 },
                TagRef { name: "beta".to_string(), line: 1 },
                TagRef { name: "gamma".to_string(), line: 1 },
            ]
        );
    }

    #[test]
    fn line_number_tracks_newlines() {
        let result = extract_tags("line1 #a\nline2 #b\n\nline4 #c");
        assert_eq!(
            result,
            vec![
                TagRef { name: "a".to_string(), line: 1 },
                TagRef { name: "b".to_string(), line: 2 },
                TagRef { name: "c".to_string(), line: 4 },
            ]
        );
    }

    #[test]
    fn nested_parent_child_tag() {
        let result = extract_tags("see #parent/child here");
        assert_eq!(
            result,
            vec![TagRef {
                name: "parent/child".to_string(),
                line: 1,
            }]
        );
    }

    #[test]
    fn tag_after_list_marker() {
        let result = extract_tags("- [ ] #todo write tests\n- [x] #done ship");
        assert_eq!(
            result,
            vec![
                TagRef { name: "todo".to_string(), line: 1 },
                TagRef { name: "done".to_string(), line: 2 },
            ]
        );
    }

    #[test]
    fn tag_inside_paren_is_extracted() {
        let result = extract_tags("see (the #caveat) for details");
        assert_eq!(
            result,
            vec![TagRef {
                name: "caveat".to_string(),
                line: 1,
            }]
        );
    }

    #[test]
    fn mid_word_hash_is_not_matched() {
        let result = extract_tags("foo#bar baz");
        assert_eq!(result, vec![]);
    }

    #[test]
    fn empty_tag_body_is_not_matched() {
        let result = extract_tags("hello # world");
        assert_eq!(result, vec![]);
    }

    #[test]
    fn tags_in_yaml_frontmatter_are_extracted_as_live_text_known_limitation() {
        let result = extract_tags("---\ntags: #frontmatter-tag\n---\n\nbody #real");
        assert_eq!(
            result,
            vec![
                TagRef {
                    name: "frontmatter-tag".to_string(),
                    line: 2,
                },
                TagRef {
                    name: "real".to_string(),
                    line: 5,
                },
            ]
        );
    }

    #[test]
    fn hex_color_standalone_is_matched_as_tag_known_limitation() {
        let result = extract_tags("color: #FFFFFF");
        assert_eq!(
            result,
            vec![TagRef {
                name: "FFFFFF".to_string(),
                line: 1,
            }]
        );
    }

    #[test]
    fn wikilink_tags_empty_content_returns_empty() {
        assert_eq!(extract_tags_from_wikilinks(""), vec![]);
    }

    #[test]
    fn wikilink_tags_single_tag_from_tags_line() {
        let result = extract_tags_from_wikilinks("Tags: [[Uptp]]");
        assert_eq!(
            result,
            vec![TagRef { name: "Uptp".to_string(), line: 1 }]
        );
    }

    #[test]
    fn wikilink_tags_multiple_tags_on_same_line() {
        let result = extract_tags_from_wikilinks("Tags: [[Uptp]] [[Physics]] [[Physics ch-21]]");
        assert_eq!(
            result,
            vec![
                TagRef { name: "Uptp".to_string(), line: 1 },
                TagRef { name: "Physics".to_string(), line: 1 },
                TagRef { name: "Physics ch-21".to_string(), line: 1 },
            ]
        );
    }

    #[test]
    fn wikilink_tags_case_insensitive() {
        let result = extract_tags_from_wikilinks("tags: [[alpha]]\nTAGS: [[beta]]");
        assert_eq!(
            result,
            vec![
                TagRef { name: "alpha".to_string(), line: 1 },
                TagRef { name: "beta".to_string(), line: 2 },
            ]
        );
    }

    #[test]
    fn wikilink_tags_line_number_correct() {
        let result = extract_tags_from_wikilinks("Status: [[baby]]\nTags: [[a]] [[b]]\n\nBody");
        assert_eq!(
            result,
            vec![
                TagRef { name: "a".to_string(), line: 2 },
                TagRef { name: "b".to_string(), line: 2 },
            ]
        );
    }

    #[test]
    fn wikilink_tags_no_tags_line_returns_empty() {
        let result = extract_tags_from_wikilinks("Status: [[baby]]\n\n# hello");
        assert_eq!(result, vec![]);
    }

    #[test]
    fn wikilink_tags_empty_after_colon_returns_empty() {
        let result = extract_tags_from_wikilinks("Tags:");
        assert_eq!(result, vec![]);
    }

    #[test]
    fn wikilink_tags_works_with_leading_whitespace() {
        let result = extract_tags_from_wikilinks("  Tags: [[hello]]");
        assert_eq!(
            result,
            vec![TagRef { name: "hello".to_string(), line: 1 }]
        );
    }
}

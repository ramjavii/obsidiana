use std::sync::OnceLock;

use regex::Regex;

use super::types::WikilinkRef;

static WIKILINK_RE: OnceLock<Regex> = OnceLock::new();

fn wikilink_re() -> &'static Regex {
    WIKILINK_RE
        .get_or_init(|| Regex::new(r"\[\[([^\[\]]+)\]\]").expect("valid wikilink regex"))
}

pub fn extract_wikilinks(content: &str) -> Vec<WikilinkRef> {
    let re = wikilink_re();
    let bytes = content.as_bytes();
    let mut out = Vec::new();
    for m in re.find_iter(content) {
        if m.start() > 0 && bytes[m.start() - 1] == b'!' {
            continue;
        }
        let inner_start = m.start() + 2;
        let inner_end = m.end() - 2;
        let inner = &content[inner_start..inner_end];
        let (target_raw, alias_raw) = match inner.split_once('|') {
            Some((t, a)) => (t, a),
            None => (inner, ""),
        };
        let target = target_raw.trim();
        if target.is_empty() {
            continue;
        }
        let alias = alias_raw.trim();
        let alias_opt = if alias.is_empty() {
            None
        } else {
            Some(alias.to_string())
        };
        let line = content[..m.start()].bytes().filter(|&b| b == b'\n').count() + 1;
        out.push(WikilinkRef {
            target: target.to_string(),
            alias: alias_opt,
            line,
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_content_returns_no_wikilinks() {
        assert_eq!(extract_wikilinks(""), vec![]);
    }

    #[test]
    fn single_wikilink_no_alias() {
        let result = extract_wikilinks("Hello [[note]] world");
        assert_eq!(
            result,
            vec![WikilinkRef {
                target: "note".to_string(),
                alias: None,
                line: 1,
            }]
        );
    }

    #[test]
    fn wikilink_with_alias() {
        let result = extract_wikilinks("See [[note|My Note]] for details");
        assert_eq!(
            result,
            vec![WikilinkRef {
                target: "note".to_string(),
                alias: Some("My Note".to_string()),
                line: 1,
            }]
        );
    }

    #[test]
    fn embed_excluded_by_lookbehind() {
        let result = extract_wikilinks("![[embed]] but [[link]] is real");
        assert_eq!(
            result,
            vec![WikilinkRef {
                target: "link".to_string(),
                alias: None,
                line: 1,
            }]
        );
    }

    #[test]
    fn multiple_wikilinks_on_same_line() {
        let result = extract_wikilinks("[[a]] and [[b]] and [[c]]");
        assert_eq!(
            result,
            vec![
                WikilinkRef { target: "a".to_string(), alias: None, line: 1 },
                WikilinkRef { target: "b".to_string(), alias: None, line: 1 },
                WikilinkRef { target: "c".to_string(), alias: None, line: 1 },
            ]
        );
    }

    #[test]
    fn line_number_tracks_newlines() {
        let result =
            extract_wikilinks("First line [[a]]\nSecond [[b]]\n\nFourth [[c]]");
        assert_eq!(
            result,
            vec![
                WikilinkRef { target: "a".to_string(), alias: None, line: 1 },
                WikilinkRef { target: "b".to_string(), alias: None, line: 2 },
                WikilinkRef { target: "c".to_string(), alias: None, line: 4 },
            ]
        );
    }

    #[test]
    fn whitespace_trimmed_around_target_and_alias() {
        let result = extract_wikilinks("[[  spaced  ]] and [[ target | alias ]]");
        assert_eq!(
            result,
            vec![
                WikilinkRef { target: "spaced".to_string(), alias: None, line: 1 },
                WikilinkRef {
                    target: "target".to_string(),
                    alias: Some("alias".to_string()),
                    line: 1,
                },
            ]
        );
    }

    #[test]
    fn chained_alias_kept_verbatim() {
        let result = extract_wikilinks("[[a|b|c]]");
        assert_eq!(
            result,
            vec![WikilinkRef {
                target: "a".to_string(),
                alias: Some("b|c".to_string()),
                line: 1,
            }]
        );
    }

    #[test]
    fn empty_alias_treated_as_no_alias() {
        let result = extract_wikilinks("[[note|]]");
        assert_eq!(
            result,
            vec![WikilinkRef {
                target: "note".to_string(),
                alias: None,
                line: 1,
            }]
        );
    }

    #[test]
    fn empty_target_skipped() {
        let result = extract_wikilinks("[[ ]] and [[real]]");
        assert_eq!(
            result,
            vec![WikilinkRef {
                target: "real".to_string(),
                alias: None,
                line: 1,
            }]
        );
    }

    #[test]
    fn wikilink_with_section_kept_as_one_target_for_now() {
        let result = extract_wikilinks("See [[note#Section]] here");
        assert_eq!(
            result,
            vec![WikilinkRef {
                target: "note#Section".to_string(),
                alias: None,
                line: 1,
            }]
        );
    }

    #[test]
    fn unbalanced_brackets_not_matched() {
        let result = extract_wikilinks("[[unclosed and [also] not");
        assert_eq!(result, vec![]);
    }
}

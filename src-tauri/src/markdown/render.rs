use crate::error::AppResult;
use crate::markdown::types::{RenderedBlockSpan, RenderedKind, RenderedNote, RenderedSpan};
use crate::markdown::wikilink::wikilink_ranges;
use markdown::mdast::Node;
use std::collections::HashSet;

/// Render `content` to a sanitized HTML fragment plus a source map
/// of inline and block spans. `resolve_wikilink` is invoked once per
/// unique wikilink target+alias in the source; it should return the
/// resolved relative path for the target, or `None` for broken
/// links (which produce no span).
pub fn render_markdown(
    content: &str,
    resolve_wikilink: impl Fn(&str) -> Option<String>,
) -> AppResult<RenderedNote> {
    if content.is_empty() {
        return Ok(RenderedNote::default());
    }

    let html = markdown::to_html(content);

    let mut inline_spans: Vec<RenderedSpan> = Vec::new();
    let mut block_spans: Vec<RenderedBlockSpan> = Vec::new();

    let tree = markdown::to_mdast(content, &markdown::ParseOptions::default())
        .map_err(|e| crate::error::AppError::internal(e.to_string()))?;
    walk(&tree, content, &mut inline_spans, &mut block_spans);

    let resolved = collect_resolved_wikilink_spans(content, &resolve_wikilink);
    inline_spans.extend(resolved);

    inline_spans.sort_by_key(|s| s.start);

    Ok(RenderedNote {
        html,
        inline_spans,
        block_spans,
    })
}

fn walk(
    node: &Node,
    _content: &str,
    inline_spans: &mut Vec<RenderedSpan>,
    block_spans: &mut Vec<RenderedBlockSpan>,
) {
    match node {
        Node::Strong(s) => {
            emit_inline(s.position.as_ref(), RenderedKind::Strong, inline_spans);
            for child in &s.children {
                walk(child, _content, inline_spans, block_spans);
            }
        }
        Node::Emphasis(e) => {
            emit_inline(e.position.as_ref(), RenderedKind::Emphasis, inline_spans);
            for child in &e.children {
                walk(child, _content, inline_spans, block_spans);
            }
        }
        Node::Delete(d) => {
            emit_inline(d.position.as_ref(), RenderedKind::Strikethrough, inline_spans);
            for child in &d.children {
                walk(child, _content, inline_spans, block_spans);
            }
        }
        Node::InlineCode(c) => {
            emit_inline(c.position.as_ref(), RenderedKind::CodeInline, inline_spans);
        }
        Node::Code(c) => {
            emit_block(
                c.position.as_ref(),
                RenderedKind::CodeBlock,
                block_spans,
            );
        }
        Node::Heading(h) => {
            emit_block(
                h.position.as_ref(),
                RenderedKind::Heading(h.depth),
                block_spans,
            );
            for child in &h.children {
                walk(child, _content, inline_spans, block_spans);
            }
        }
        Node::Link(l) => {
            emit_inline(l.position.as_ref(), RenderedKind::Link, inline_spans);
            for child in &l.children {
                walk(child, _content, inline_spans, block_spans);
            }
        }
        _ => {
            for child in children_of(node) {
                walk(child, _content, inline_spans, block_spans);
            }
        }
    }
}

fn children_of(node: &Node) -> &[Node] {
    match node {
        Node::Root(x) => &x.children,
        Node::Blockquote(x) => &x.children,
        Node::FootnoteDefinition(x) => &x.children,
        Node::MdxJsxFlowElement(x) => &x.children,
        Node::List(x) => &x.children,
        Node::ListItem(x) => &x.children,
        Node::Paragraph(x) => &x.children,
        Node::Table(x) => &x.children,
        Node::TableRow(x) => &x.children,
        Node::TableCell(x) => &x.children,
        Node::LinkReference(x) => &x.children,
        _ => &[],
    }
}

fn emit_inline(
    pos: Option<&markdown::unist::Position>,
    kind: RenderedKind,
    out: &mut Vec<RenderedSpan>,
) {
    let Some(p) = pos else { return };
    out.push(RenderedSpan {
        start: p.start.offset,
        end: p.end.offset,
        kind,
    });
}

fn emit_block(
    pos: Option<&markdown::unist::Position>,
    kind: RenderedKind,
    out: &mut Vec<RenderedBlockSpan>,
) {
    let Some(p) = pos else { return };
    out.push(RenderedBlockSpan {
        start_line: p.start.line,
        end_line: p.end.line,
        kind,
    });
}

fn collect_resolved_wikilink_spans(
    content: &str,
    resolve_wikilink: &impl Fn(&str) -> Option<String>,
) -> Vec<RenderedSpan> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<RenderedSpan> = Vec::new();
    for range in wikilink_ranges(content) {
        let key = format!("{}|{}", range.target, range.alias.as_deref().unwrap_or(""));
        if !seen.insert(key) {
            continue;
        }
        if resolve_wikilink(&range.target).is_some() {
            out.push(RenderedSpan {
                start: range.start,
                end: range.end,
                kind: RenderedKind::WikilinkResolved,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn always_resolve(_target: &str) -> Option<String> {
        Some("resolved.md".to_string())
    }

    fn never_resolve(_target: &str) -> Option<String> {
        None
    }

    #[test]
    fn empty_input_returns_empty_html() {
        let note = render_markdown("", always_resolve).expect("render empty");
        assert_eq!(note.html, "");
        assert!(note.inline_spans.is_empty());
        assert!(note.block_spans.is_empty());
    }

    #[test]
    fn plain_text_renders_to_paragraph() {
        let note = render_markdown("hello world", never_resolve).expect("render");
        assert!(note.html.contains("<p>hello world</p>"));
        assert!(note.inline_spans.is_empty());
        assert!(note.block_spans.is_empty());
    }

    #[test]
    fn bold_emits_strong_inline_span() {
        let src = "**bold**";
        let note = render_markdown(src, never_resolve).expect("render");
        assert_eq!(note.inline_spans.len(), 1);
        let span = &note.inline_spans[0];
        assert_eq!(span.kind, RenderedKind::Strong);
        assert_eq!(&src[span.start..span.end], "**bold**");
    }

    #[test]
    fn italic_emits_emphasis_inline_span() {
        let src = "*italic*";
        let note = render_markdown(src, never_resolve).expect("render");
        assert_eq!(note.inline_spans.len(), 1);
        let span = &note.inline_spans[0];
        assert_eq!(span.kind, RenderedKind::Emphasis);
        assert_eq!(&src[span.start..span.end], "*italic*");
    }

    #[test]
    fn heading_emits_heading_block_span_with_depth() {
        let src = "## h2";
        let note = render_markdown(src, never_resolve).expect("render");
        assert_eq!(note.block_spans.len(), 1);
        let block = &note.block_spans[0];
        assert_eq!(block.kind, RenderedKind::Heading(2));
        assert_eq!(block.start_line, 1);
        assert_eq!(block.end_line, 1);
    }

    #[test]
    fn inline_code_emits_code_inline_span() {
        let src = "say `hi` please";
        let note = render_markdown(src, never_resolve).expect("render");
        assert_eq!(note.inline_spans.len(), 1);
        let span = &note.inline_spans[0];
        assert_eq!(span.kind, RenderedKind::CodeInline);
        assert_eq!(&src[span.start..span.end], "`hi`");
    }

    #[test]
    fn fenced_code_block_emits_code_block_block_span_with_no_inline_spans_inside() {
        let src = "```\nline1\nline2\n```";
        let note = render_markdown(src, never_resolve).expect("render");
        assert_eq!(note.block_spans.len(), 1);
        let block = &note.block_spans[0];
        assert_eq!(block.kind, RenderedKind::CodeBlock);
        assert_eq!(block.start_line, 1);
        assert_eq!(block.end_line, 4);
        assert!(
            note.inline_spans.is_empty(),
            "no inline spans inside fenced code"
        );
    }

    #[test]
    fn link_emits_link_inline_span() {
        let src = "[x](https://example.com)";
        let note = render_markdown(src, never_resolve).expect("render");
        assert_eq!(note.inline_spans.len(), 1);
        let span = &note.inline_spans[0];
        assert_eq!(span.kind, RenderedKind::Link);
        assert_eq!(&src[span.start..span.end], "[x](https://example.com)");
    }

    #[test]
    fn resolved_wikilink_emits_wikilink_resolved_span() {
        let src = "see [[note]] here";
        let note = render_markdown(src, always_resolve).expect("render");
        let span = note
            .inline_spans
            .iter()
            .find(|s| s.kind == RenderedKind::WikilinkResolved)
            .expect("resolved wikilink span");
        assert_eq!(&src[span.start..span.end], "[[note]]");
    }

    #[test]
    fn broken_wikilink_emits_no_span() {
        let src = "see [[missing]] here";
        let note = render_markdown(src, never_resolve).expect("render");
        assert!(
            !note
                .inline_spans
                .iter()
                .any(|s| s.kind == RenderedKind::WikilinkResolved),
            "broken wikilink should not produce a span"
        );
        assert!(note.html.contains("[[missing]]"), "source text preserved");
    }

    #[test]
    fn nested_strong_emphasis_emits_two_stacked_spans() {
        let src = "**bold *italic***";
        let note = render_markdown(src, never_resolve).expect("render");
        let kinds: Vec<_> = note.inline_spans.iter().map(|s| s.kind).collect();
        assert!(kinds.contains(&RenderedKind::Strong));
        assert!(kinds.contains(&RenderedKind::Emphasis));
    }

    #[test]
    fn script_tag_in_source_is_escaped_not_stripped() {
        let src = "hi <script>alert(1)</script> there";
        let note = render_markdown(src, never_resolve).expect("render");
        assert!(!note.html.contains("<script>"), "raw script tag must not appear");
        assert!(note.html.contains("&lt;script&gt;"));
        assert!(!note.html.contains("</script>"));
    }

    #[test]
    fn javascript_href_is_dropped() {
        let src = "[bad](javascript:alert(1))";
        let note = render_markdown(src, never_resolve).expect("render");
        assert!(!note.html.contains("javascript:"));
        assert!(!note.html.contains("alert(1)"));
    }

    #[test]
    fn all_spans_have_valid_sorted_byte_ranges() {
        let src = "**a** *b* `c` [[d]]";
        let note = render_markdown(src, always_resolve).expect("render");
        let mut last_end = 0;
        for span in &note.inline_spans {
            assert!(span.start <= span.end, "start <= end for {span:?}");
            assert!(
                span.end <= src.len(),
                "end {} <= src.len() {} for {span:?}",
                span.end,
                src.len()
            );
            assert!(span.start >= last_end, "spans sorted by start");
            last_end = span.end;
        }
    }

    #[test]
    fn block_span_line_ranges_match_content() {
        let src = "# a\n\n```\nb\n```\n\n# c";
        let note = render_markdown(src, never_resolve).expect("render");
        let headings: Vec<&RenderedBlockSpan> = note
            .block_spans
            .iter()
            .filter(|b| matches!(b.kind, RenderedKind::Heading(_)))
            .collect();
        let code_blocks: Vec<&RenderedBlockSpan> = note
            .block_spans
            .iter()
            .filter(|b| b.kind == RenderedKind::CodeBlock)
            .collect();
        assert_eq!(headings.len(), 2);
        assert_eq!(code_blocks.len(), 1);
        assert_eq!(headings[0].start_line, 1);
        assert_eq!(headings[0].end_line, 1);
        assert_eq!(code_blocks[0].start_line, 3);
        assert_eq!(code_blocks[0].end_line, 5);
        assert_eq!(headings[1].start_line, 7);
        assert_eq!(headings[1].end_line, 7);
    }

    #[test]
    fn resolver_not_called_for_empty_input() {
        let called = RefCell::new(0);
        let counter = |_: &str| -> Option<String> {
            *called.borrow_mut() += 1;
            None
        };
        let _ = render_markdown("", counter).expect("render empty");
        assert_eq!(*called.borrow(), 0, "resolver should not run on empty input");
    }

    #[test]
    fn resolver_called_once_per_unique_wikilink_target() {
        let called = RefCell::new(Vec::<String>::new());
        let recorder = |target: &str| -> Option<String> {
            called.borrow_mut().push(target.to_string());
            Some(format!("{target}.md"))
        };
        let src = "see [[a]] and [[a]] and [[b]] and [[a|alias]]";
        let _ = render_markdown(src, recorder).expect("render");
        let calls = called.borrow();
        assert_eq!(
            calls.len(),
            3,
            "deduped to unique target+alias pairs (a, b, a+alias): {calls:?}"
        );
    }
}

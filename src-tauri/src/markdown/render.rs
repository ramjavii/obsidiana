use crate::error::AppResult;
use crate::markdown::types::RenderedNote;

pub fn render_markdown(_content: &str) -> AppResult<RenderedNote> {
    Ok(RenderedNote::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::types::{RenderedBlockSpan, RenderedSpan};

    #[test]
    fn render_markdown_returns_rendered_note_shape_for_empty_input() {
        let note = render_markdown("").expect("empty input should render");
        assert_eq!(note.html, "");
        assert!(note.inline_spans.is_empty());
        assert!(note.block_spans.is_empty());
    }

    #[test]
    fn render_markdown_returns_rendered_note_for_plain_text() {
        let note = render_markdown("hello world").expect("plain text should render");
        assert!(note.inline_spans.is_empty());
        assert!(note.block_spans.is_empty());
    }

    #[test]
    fn render_markdown_exposes_inline_and_block_span_types() {
        let note = render_markdown("").expect("empty input should render");
        let _inline: RenderedSpan = note
            .inline_spans
            .into_iter()
            .next()
            .unwrap_or(RenderedSpan {
                start: 0,
                end: 0,
                kind: crate::markdown::types::RenderedKind::Strong,
            });
        let _block: RenderedBlockSpan = note
            .block_spans
            .into_iter()
            .next()
            .unwrap_or(RenderedBlockSpan {
                start_line: 0,
                end_line: 0,
                kind: crate::markdown::types::RenderedKind::Strong,
            });
    }
}

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikilinkRef {
    pub target: String,
    pub alias: Option<String>,
    pub line: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ResolvedLink {
    Resolved {
        target: String,
        source_path: String,
        resolved_path: String,
        section: Option<String>,
        alias: Option<String>,
    },
    Broken {
        target: String,
        source_path: String,
        section: Option<String>,
        alias: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "level", rename_all = "camelCase")]
pub enum RenderedKind {
    Strong,
    Emphasis,
    Strikethrough,
    Heading(u8),
    CodeInline,
    CodeBlock,
    Link,
    WikilinkResolved,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenderedSpan {
    pub start: usize,
    pub end: usize,
    pub kind: RenderedKind,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenderedBlockSpan {
    pub start_line: usize,
    pub end_line: usize,
    pub kind: RenderedKind,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct RenderedNote {
    pub html: String,
    pub inline_spans: Vec<RenderedSpan>,
    pub block_spans: Vec<RenderedBlockSpan>,
}

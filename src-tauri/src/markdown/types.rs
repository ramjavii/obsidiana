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

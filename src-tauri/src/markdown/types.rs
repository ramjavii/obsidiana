use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WikilinkRef {
    pub target: String,
    pub alias: Option<String>,
    pub line: usize,
}

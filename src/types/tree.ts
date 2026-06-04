export type TreeNodeKind = "file" | "dir";

export type TreeNode = {
  name: string;
  path: string;
  kind: TreeNodeKind;
  extension: string | null;
};

export type NoteContent = {
  path: string;
  content: string;
  modifiedAt: string;
};

export type RenameReport = {
  from: string;
  to: string;
};

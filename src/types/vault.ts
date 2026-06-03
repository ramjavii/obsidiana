export type VaultInfo = {
  name: string;
  path: string;
};

export type RecentVault = {
  name: string;
  path: string;
  lastOpened: string;
  available: boolean;
};

export type VaultStatus =
  | { kind: "none" }
  | { kind: "open"; vault: VaultInfo };

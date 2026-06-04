import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useCloseVaultMutation,
  useOpenVaultForceMutation,
  usePickVaultMutation,
} from "@/hooks/useVault";
import { listRecentVaults } from "@/ipc/vault";
import type { VaultInfo } from "@/types/vault";

type Props = {
  vault: VaultInfo;
};

export function VaultSwitcher({ vault }: Props) {
  const [open, setOpen] = useState(false);
  const recents = useQuery({
    queryKey: ["vault", "recents"],
    queryFn: listRecentVaults,
    refetchOnWindowFocus: false,
  });
  const pick = usePickVaultMutation();
  const switchTo = useOpenVaultForceMutation();
  const close = useCloseVaultMutation();

  const otherRecents = (recents.data ?? []).filter((r) => r.path !== vault.path);

  return (
    <div data-testid="vault-switcher" className="relative flex items-center gap-2">
      <button
        type="button"
        data-testid="vault-switcher-toggle"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
      >
        <span className="font-medium">{vault.name}</span>
        <span className="text-xs text-zinc-500">▾</span>
      </button>
      {open && (
        <div
          data-testid="vault-switcher-menu"
          className="absolute left-0 top-full z-40 mt-1 w-72 rounded border border-zinc-700 bg-zinc-900 p-2 text-sm shadow-xl"
          role="menu"
        >
          <div className="px-2 py-1 text-xs uppercase tracking-wide text-zinc-500">
            Current
          </div>
          <div className="px-2 py-1 text-zinc-200" data-testid="current-vault-name">
            {vault.name}
          </div>
          <div className="px-2 pb-2 text-xs text-zinc-500">{vault.path}</div>
          {otherRecents.length > 0 && (
            <>
              <div className="mt-2 border-t border-zinc-800 px-2 pt-2 text-xs uppercase tracking-wide text-zinc-500">
                Recents
              </div>
              {otherRecents.map((r) => (
                <button
                  key={r.path}
                  type="button"
                  data-testid={`recent-${r.name}`}
                  disabled={!r.available || switchTo.isPending}
                  onClick={() => {
                    setOpen(false);
                    switchTo.mutate(r.path);
                  }}
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
                >
                  <span>{r.name}</span>
                  <span className="text-xs text-zinc-500">
                    {r.available ? "" : "missing"}
                  </span>
                </button>
              ))}
            </>
          )}
          <div className="mt-2 flex flex-col gap-1 border-t border-zinc-800 pt-2">
            <button
              type="button"
              data-testid="switch-vault"
              disabled={pick.isPending}
              onClick={() => {
                setOpen(false);
                pick.mutate(undefined);
              }}
              className="rounded px-2 py-1 text-left text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              Switch vault…
            </button>
            <button
              type="button"
              data-testid="close-vault"
              disabled={close.isPending}
              onClick={() => {
                setOpen(false);
                close.mutate(undefined);
              }}
              className="rounded px-2 py-1 text-left text-rose-300 hover:bg-zinc-800 disabled:opacity-40"
            >
              Close vault
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

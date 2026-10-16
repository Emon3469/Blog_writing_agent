"use client";

import Link from "next/link";
import { Bell, ChevronsUpDown, Menu, Search, Settings, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useShell } from "./ShellContext";
import { Popover } from "@/components/ui/Popover";
import { useServerHealth } from "@/lib/health";
import { clearNotices, markNoticesRead, useLibrary, usePreferences } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";

const STATE_STYLE = {
  checking: { dot: "bg-faint", label: "Connecting" },
  waking: { dot: "bg-warning animate-pulse", label: "Waking server" },
  online: { dot: "bg-success", label: "Online" },
  offline: { dot: "bg-danger", label: "Offline" },
} as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "DS";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { openPalette } = useShell();
  const { notices } = useLibrary();
  const prefs = usePreferences();
  const server = useServerHealth();
  const unread = notices.filter((n) => !n.read).length;
  const style = STATE_STYLE[server.state];

  const onNoticesOpen = useCallback((open: boolean) => {
    if (!open) markNoticesRead();
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-xl md:px-6">
      <button onClick={onMenu} className="btn-ghost -ml-1 p-2 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      <button
        onClick={openPalette}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-2 text-left text-sm text-faint transition hover:text-muted md:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate">Search documents, chats and pages</span>
      </button>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <Link
          href="/settings"
          className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted transition hover:text-ink sm:flex"
          title="Writing server status"
        >
          <span className={cn("h-2 w-2 rounded-full", style.dot)} />
          {style.label}
        </Link>

        <ThemeToggle />

        <Popover
          onOpenChange={onNoticesOpen}
          className="w-80"
          trigger={({ toggle }) => (
            <button
              onClick={toggle}
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-ink transition hover:bg-subtle"
            >
              <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {unread > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
              )}
            </button>
          )}
        >
          {(close) => (
            <div>
              <div className="flex items-center justify-between px-2.5 py-2">
                <p className="text-sm font-semibold">Notifications</p>
                {notices.length > 0 && (
                  <button onClick={clearNotices} className="text-muted transition hover:text-ink" aria-label="Clear notifications">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {notices.length === 0 ? (
                  <p className="px-2.5 pb-4 pt-2 text-sm text-muted">You&apos;re all caught up.</p>
                ) : (
                  notices.map((n) => (
                    <Link
                      key={n.id}
                      href={n.href || "#"}
                      onClick={close}
                      className="block rounded-xl px-2.5 py-2 transition hover:bg-subtle"
                    >
                      <div className="flex items-center gap-2">
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />}
                        <p className="truncate text-sm font-medium">{n.title}</p>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</p>
                      <p className="mt-1 text-[11px] text-faint">{timeAgo(n.at)}</p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </Popover>

        <Popover
          className="w-56"
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex items-center gap-1 rounded-full transition hover:opacity-80" aria-label="Account menu">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-950 text-xs font-semibold text-white ring-2 ring-surface dark:from-zinc-200 dark:to-zinc-400 dark:text-zinc-900">
                {initials(prefs.name)}
              </span>
              <ChevronsUpDown className="hidden h-4 w-4 text-muted sm:block" />
            </button>
          )}
        >
          {(close) => (
            <div>
              <div className="px-2.5 py-2">
                <p className="truncate text-sm font-semibold">{prefs.name || "Guest writer"}</p>
                <p className="text-xs text-muted">Local workspace</p>
              </div>
              <div className="my-1 h-px bg-line" />
              <Link href="/settings" onClick={close} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-muted transition hover:bg-subtle hover:text-ink">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}

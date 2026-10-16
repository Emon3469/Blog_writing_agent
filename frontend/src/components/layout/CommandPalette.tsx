"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CornerDownLeft,
  FileText,
  LayoutGrid,
  LayoutTemplate,
  MessagesSquare,
  Moon,
  PenLine,
  Search,
  Settings,
  Upload,
  Wand2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useLibrary } from "@/lib/store";
import { excerpt } from "@/lib/text";
import { cn, timeAgo } from "@/lib/utils";

type Item = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: typeof Search;
  run: () => void;
};

export function CommandPalette({ open, onClose, onUpload }: { open: boolean; onClose: () => void; onUpload: () => void }) {
  const router = useRouter();
  const { docs, conversations } = useLibrary();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const pages: Item[] = [
      { id: "p-home", label: "Overview", group: "Pages", icon: LayoutGrid, run: go("/") },
      { id: "p-studio", label: "New blog post", hint: "Blog Studio", group: "Pages", icon: PenLine, run: go("/studio") },
      { id: "p-docs", label: "Documents", group: "Pages", icon: FileText, run: go("/documents") },
      { id: "p-chat", label: "Chat with assistant", group: "Pages", icon: MessagesSquare, run: go("/chat") },
      { id: "p-tools", label: "Rewrite tools", group: "Pages", icon: Wand2, run: go("/tools") },
      { id: "p-templates", label: "Templates", group: "Pages", icon: LayoutTemplate, run: go("/templates") },
      { id: "p-settings", label: "Settings", group: "Pages", icon: Settings, run: go("/settings") },
      { id: "a-upload", label: "Import a Markdown or text file", group: "Actions", icon: Upload, run: onUpload },
      {
        id: "a-theme",
        label: `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`,
        group: "Actions",
        icon: Moon,
        run: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
    ];
    const docItems: Item[] = docs.map((d) => ({
      id: `d-${d.id}`,
      label: d.title,
      hint: `${d.status} · ${timeAgo(d.updatedAt)}`,
      group: "Documents",
      icon: FileText,
      run: go(`/documents/${d.id}`),
    }));
    const chatItems: Item[] = conversations.map((c) => ({
      id: `c-${c.id}`,
      label: c.title,
      hint: timeAgo(c.updatedAt),
      group: "Chats",
      icon: MessagesSquare,
      run: go(`/chat?c=${c.id}`),
    }));

    const q = query.trim().toLowerCase();
    const all = [...pages, ...docItems, ...chatItems];
    if (!q) return [...pages, ...docItems.slice(0, 5), ...chatItems.slice(0, 3)];
    return all.filter((item) => {
      if (item.label.toLowerCase().includes(q) || item.hint?.toLowerCase().includes(q)) return true;
      if (item.group === "Documents") {
        const doc = docs.find((d) => `d-${d.id}` === item.id);
        return doc ? excerpt(doc.content, 4000).toLowerCase().includes(q) : false;
      }
      return false;
    });
  }, [query, docs, conversations, router, onUpload, resolvedTheme, setTheme]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const select = (item?: Item) => {
    if (!item) return;
    onClose();
    setQuery("");
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(items[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="card w-full max-w-xl animate-rise overflow-hidden shadow-2xl shadow-black/10"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search documents, chats, pages…"
            className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] text-faint">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2 scrollbar-thin">
          {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">No results for &ldquo;{query}&rdquo;</p>}
          {items.map((item, index) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {header && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-faint">{header}</p>}
                <button
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => select(item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                    index === active ? "bg-subtle text-ink" : "text-ink-soft",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-xs capitalize text-faint">{item.hint}</span>}
                  {index === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

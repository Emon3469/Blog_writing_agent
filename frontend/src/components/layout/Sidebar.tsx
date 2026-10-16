"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Download,
  FileText,
  LayoutGrid,
  LayoutTemplate,
  MessagesSquare,
  PenLine,
  Search,
  Settings,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Logo, LogoMark } from "./Logo";
import { useShell } from "./ShellContext";
import { useLibrary } from "@/lib/store";
import { cn, downloadFile } from "@/lib/utils";

const MAIN = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/studio", label: "Blog Studio", icon: PenLine },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/settings", label: "Settings", icon: Settings },
];

const APPS = [
  { href: "/chat", label: "Chats", icon: MessagesSquare },
  { href: "/tools", label: "Rewrite Tools", icon: Wand2 },
];

function NavLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof LayoutGrid }) {
  const pathname = usePathname();
  const { closeNav } = useShell();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      onClick={closeNav}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-muted hover:bg-subtle hover:text-ink",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px]", active ? "text-ink" : "text-faint group-hover:text-ink")} strokeWidth={1.75} />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const { openPalette, openUpload, closeNav } = useShell();
  const { docs } = useLibrary();

  const exportLibrary = () => {
    if (!docs.length) {
      toast("Your library is empty", { description: "Generate or upload a document first." });
      return;
    }
    const bundle = docs
      .map((d) => `<!-- ${d.title} · ${d.status} · ${d.updatedAt} -->\n\n${d.content.trim()}`)
      .join("\n\n---\n\n");
    downloadFile(`draftsmith-library-${new Date().toISOString().slice(0, 10)}.md`, bundle);
    toast.success(`Exported ${docs.length} document${docs.length > 1 ? "s" : ""}`);
  };

  return (
    <div className="flex h-full flex-col gap-6 px-4 pb-4 pt-4">
      <Link href="/" onClick={closeNav} className="card flex items-center px-3.5 py-3">
        <Logo />
      </Link>

      <nav className="flex flex-col gap-1">
        <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-faint">Main menu</p>
        <button
          onClick={openPalette}
          className="mb-2 flex items-center gap-3 rounded-xl bg-subtle px-3 py-2.5 text-left text-sm text-muted transition hover:text-ink"
        >
          <Search className="h-[18px] w-[18px] text-faint" strokeWidth={1.75} />
          <span className="flex-1">Search</span>
          <kbd className="flex items-center gap-1 text-[11px] text-faint">
            <span className="rounded-md border border-line bg-surface px-1.5 py-0.5">Ctrl</span>
            <span className="rounded-md border border-line bg-surface px-1.5 py-0.5">K</span>
          </kbd>
        </button>
        {MAIN.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>

      <nav className="flex flex-col gap-1">
        <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-faint">Apps</p>
        {APPS.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
        <button
          onClick={() => {
            closeNav();
            openUpload();
          }}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted transition-colors hover:bg-subtle hover:text-ink"
        >
          <Upload className="h-[18px] w-[18px] text-faint group-hover:text-ink" strokeWidth={1.75} />
          Import File
        </button>
      </nav>

      <div className="relative mt-auto overflow-hidden rounded-2xl bg-subtle p-4 text-center">
        <LogoMark className="pointer-events-none absolute -left-6 -top-8 h-36 w-36 opacity-[0.05]" />
        <p className="relative text-base font-semibold text-ink">Export your Library</p>
        <p className="relative mt-1 text-xs leading-relaxed text-muted">
          Download every draft as a single Markdown file, ready for any CMS.
        </p>
        <button onClick={exportLibrary} className="btn-primary relative mt-4 w-full rounded-full py-2.5">
          <Download className="h-4 w-4" />
          Download
        </button>
      </div>
    </div>
  );
}

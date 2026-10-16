"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { CommandPalette } from "./CommandPalette";
import { ShellContext } from "./ShellContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { createDoc, pushNotice } from "@/lib/store";
import { titleFrom } from "@/lib/text";
import { cn } from "@/lib/utils";

const MAX_UPLOAD_BYTES = 1024 * 1024;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
  }, [navOpen]);

  const openUpload = useCallback(() => fileRef.current?.click(), []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File is too large", { description: "Please upload a file under 1 MB." });
      return;
    }
    if (!/\.(md|markdown|txt|mdx)$/i.test(file.name)) {
      toast.error("Unsupported file type", { description: "Upload a .md, .markdown or .txt file." });
      return;
    }
    const content = (await file.text()).replace(/\r\n/g, "\n");
    if (!content.trim()) {
      toast.error("That file is empty");
      return;
    }
    const fallback = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
    const doc = createDoc({ title: titleFrom(content, fallback), content, origin: "uploaded" });
    pushNotice({ title: "File imported", body: doc.title, href: `/documents/${doc.id}` });
    toast.success("File imported", { description: doc.title });
    router.push(`/documents/${doc.id}`);
  };

  const ctx = useMemo(
    () => ({ openPalette: () => setPaletteOpen(true), openUpload, closeNav: () => setNavOpen(false) }),
    [openUpload],
  );

  const wide = pathname.startsWith("/chat");

  return (
    <ShellContext.Provider value={ctx}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 overflow-y-auto border-r border-line bg-canvas no-scrollbar lg:block">
          <Sidebar />
        </aside>

        <div
          className={cn("fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity lg:hidden", navOpen ? "opacity-100" : "pointer-events-none opacity-0")}
          onClick={() => setNavOpen(false)}
        />
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[280px] overflow-y-auto border-r border-line bg-canvas transition-transform duration-300 lg:hidden",
            navOpen ? "translate-x-0" : "-translate-x-full",
          )}
          aria-hidden={!navOpen}
        >
          <button onClick={() => setNavOpen(false)} className="btn-ghost absolute right-3 top-5 z-10 p-2" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
          <Sidebar />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setNavOpen(true)} />
          <main className={cn("mx-auto w-full flex-1 px-4 pb-10 pt-6 md:px-6", wide ? "max-w-[1400px]" : "max-w-[1280px]")}>
            {children}
          </main>
        </div>
      </div>

      <input ref={fileRef} type="file" accept=".md,.markdown,.mdx,.txt,text/markdown,text/plain" className="hidden" onChange={onFile} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onUpload={openUpload} />
    </ShellContext.Provider>
  );
}

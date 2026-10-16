"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FilePlus2, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useShell } from "@/components/layout/ShellContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { createDoc, deleteDoc, importDocs, useHydrated, useLibrary, type Doc } from "@/lib/store";
import { analyze, excerpt, formatDuration } from "@/lib/text";
import { cn, timeAgo } from "@/lib/utils";

const FILTERS = ["all", "draft", "published"] as const;
const SORTS = { updated: "Last edited", created: "Newest", title: "Title" } as const;

export function DocumentsView() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { docs } = useLibrary();
  const { openUpload } = useShell();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [sort, setSort] = useState<keyof typeof SORTS>("updated");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs
      .filter((d) => filter === "all" || d.status === filter)
      .filter((d) => !q || d.title.toLowerCase().includes(q) || d.content.toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "title" ? a.title.localeCompare(b.title) : sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt),
      );
  }, [docs, query, filter, sort]);

  const remove = (doc: Doc) => {
    deleteDoc(doc.id);
    toast("Document deleted", {
      description: doc.title,
      action: { label: "Undo", onClick: () => importDocs([doc]) },
    });
  };

  const blank = () => {
    const doc = createDoc({ title: "Untitled draft", content: "# Untitled draft\n\n", origin: "manual" });
    router.push(`/documents/${doc.id}`);
  };

  return (
    <>
      <PageHeader
        title="Documents"
        description="Every post you generate, import or write lives here — stored privately in this browser."
        actions={
          <>
            <button onClick={openUpload} className="btn-outline rounded-full py-1.5 text-xs">
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
            <button onClick={blank} className="btn-outline rounded-full py-1.5 text-xs">
              <FilePlus2 className="h-3.5 w-3.5" />
              Blank
            </button>
            <Link href="/studio" className="btn-primary rounded-full py-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Generate
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by title or content" className="input pl-10" />
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-xl border border-line bg-subtle p-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn("rounded-lg px-3 py-1.5 text-xs capitalize transition", filter === f ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink")}
              >
                {f}
              </button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} className="input w-auto py-2 text-xs" aria-label="Sort documents">
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hydrated ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-44" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <FileText className="h-8 w-8 text-faint" strokeWidth={1.5} />
          <p className="mt-3 font-medium">{docs.length ? "No documents match your search" : "No documents yet"}</p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            {docs.length ? "Try a different keyword or filter." : "Generate your first post in Blog Studio or import an existing Markdown file."}
          </p>
          {!docs.length && (
            <Link href="/studio" className="btn-primary mt-5 rounded-full">
              <Plus className="h-4 w-4" />
              Generate a post
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((doc) => {
            const stats = analyze(doc.content);
            return (
              <div key={doc.id} className="group card relative flex flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5">
                <Link href={`/documents/${doc.id}`} className="absolute inset-0 rounded-2xl" aria-label={`Open ${doc.title}`} />
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("chip capitalize", doc.status === "published" && "border-ink text-ink")}>{doc.status}</span>
                  <button
                    onClick={() => remove(doc)}
                    className="relative z-10 rounded-lg p-1.5 text-faint opacity-100 transition hover:bg-subtle hover:text-danger sm:opacity-0 sm:group-hover:opacity-100"
                    aria-label="Delete document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="mt-3 line-clamp-2 font-semibold leading-snug tracking-tight">{doc.title}</h3>
                <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted">{excerpt(doc.content, 220) || "Empty document"}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[11px] text-faint">
                  <span className="tabular-nums">{stats.words.toLocaleString()} words</span>
                  <span>{formatDuration(stats.readingSeconds)} read</span>
                  <span className="ml-auto">{timeAgo(doc.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

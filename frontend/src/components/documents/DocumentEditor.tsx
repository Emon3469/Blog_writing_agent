"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Columns2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  MessagesSquare,
  Pencil,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { deleteDoc, updateDoc, useHydrated, useLibrary, type Doc } from "@/lib/store";
import { findTemplate } from "@/lib/templates";
import { analyze, formatDuration } from "@/lib/text";
import { cn, copyText, downloadFile, formatStamp, slugify } from "@/lib/utils";

type View = "write" | "preview" | "split";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-subtle p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Editor({ doc }: { doc: Doc }) {
  const router = useRouter();
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [view, setView] = useState<View>("preview");
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Partial<Doc>>({});

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        updateDoc(doc.id, pending.current);
      }
    },
    [doc.id],
  );

  const queueSave = (patch: Partial<Doc>) => {
    pending.current = { ...pending.current, ...patch };
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      updateDoc(doc.id, pending.current);
      pending.current = {};
      timer.current = null;
      setSaved(true);
    }, 500);
  };

  const stats = analyze(content);

  const remove = () => {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    deleteDoc(doc.id);
    toast("Document deleted");
    router.push("/documents");
  };

  const views: { id: View; icon: typeof Eye; label: string }[] = [
    { id: "write", icon: Pencil, label: "Write" },
    { id: "preview", icon: Eye, label: "Preview" },
    { id: "split", icon: Columns2, label: "Split" },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/documents" className="btn-ghost -ml-2 px-2 py-1.5 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Documents
        </Link>
        <span className="text-xs text-faint">{saved ? "All changes saved" : "Saving…"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Link href={`/chat?doc=${doc.id}`} className="btn-outline px-2.5 py-1.5 text-xs">
            <MessagesSquare className="h-3.5 w-3.5" />
            Ask assistant
          </Link>
          <Link href={`/tools?doc=${doc.id}&mode=improve`} className="btn-outline px-2.5 py-1.5 text-xs">
            <Wand2 className="h-3.5 w-3.5" />
            Rewrite
          </Link>
          <button
            onClick={async () => {
              if (await copyText(content)) toast.success("Markdown copied");
            }}
            className="btn-outline px-2.5 py-1.5 text-xs"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          <button onClick={() => downloadFile(`${slugify(title)}.md`, content)} className="btn-outline px-2.5 py-1.5 text-xs">
            <Download className="h-3.5 w-3.5" />
            .md
          </button>
          <button onClick={remove} className="btn-outline px-2.5 py-1.5 text-xs hover:text-danger" aria-label="Delete document">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              queueSave({ title: e.target.value || "Untitled draft" });
            }}
            className="mb-3 w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-faint md:text-[28px]"
            placeholder="Untitled draft"
            aria-label="Document title"
          />
          <div className="mb-3 flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-line bg-subtle p-1">
              {views.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition",
                    id === "split" && "hidden lg:flex",
                    view === id ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={cn("grid gap-4", view === "split" && "lg:grid-cols-2")}>
            {(view === "write" || view === "split") && (
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  queueSave({ content: e.target.value });
                }}
                spellCheck
                className="card min-h-[70vh] w-full resize-y p-5 font-mono text-[13px] leading-relaxed outline-none focus:ring-4 focus:ring-[var(--ring)]"
                placeholder="Start writing in Markdown…"
              />
            )}
            {(view === "preview" || view === "split") && (
              <article className={cn("card min-h-[70vh] p-5 md:p-10", view === "split" && "max-h-[80vh] overflow-y-auto scrollbar-thin md:p-6")}>
                {content.trim() ? <Markdown content={content} /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
              </article>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          <div className="card p-4">
            <p className="text-sm font-semibold">Status</p>
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-subtle p-1">
              {(["draft", "published"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    updateDoc(doc.id, { status: s });
                    if (s === "published") toast.success("Marked as published");
                  }}
                  className={cn(
                    "rounded-lg py-1.5 text-xs capitalize transition",
                    doc.status === s ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <p className="text-sm font-semibold">Analytics</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Words" value={stats.words.toLocaleString()} />
              <Stat label="Reading time" value={formatDuration(stats.readingSeconds)} />
              <Stat label="Readability" value={stats.readability} />
              <Stat label="Sentences" value={stats.sentences} />
            </div>
            <p className="mt-3 text-xs text-muted">
              Flesch reading ease: <span className="font-medium text-ink">{stats.grade}</span>. Aim for 50–70 for a general technical audience.
            </p>
          </div>

          {doc.sources && doc.sources.length > 0 && (
            <div className="card p-4">
              <p className="text-sm font-semibold">Sources</p>
              <ul className="mt-2 flex max-h-60 flex-col gap-1 overflow-y-auto scrollbar-thin">
                {doc.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-2 rounded-lg p-1.5 text-xs hover:bg-subtle">
                      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-faint group-hover:text-ink" />
                      <span className="line-clamp-2 text-ink-soft">{s.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4 text-xs text-muted">
            <div className="flex justify-between py-1">
              <span>Created</span>
              <span className="text-ink-soft">{formatStamp(doc.createdAt)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Updated</span>
              <span className="text-ink-soft">{formatStamp(doc.updatedAt)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Origin</span>
              <span className="capitalize text-ink-soft">{doc.origin}</span>
            </div>
            {doc.template && (
              <div className="flex justify-between py-1">
                <span>Template</span>
                <span className="text-ink-soft">{findTemplate(doc.template)?.name ?? doc.template}</span>
              </div>
            )}
            {doc.providers && doc.providers.length > 0 && (
              <div className="flex justify-between py-1">
                <span>Model provider</span>
                <span className="capitalize text-ink-soft">{doc.providers.join(", ")}</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

export function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const { docs } = useLibrary();
  const doc = docs.find((d) => d.id === id);

  if (!hydrated) return <div className="skeleton h-[70vh] w-full rounded-2xl" />;

  if (!doc) {
    return (
      <div className="card grid place-items-center px-6 py-20 text-center">
        <FileText className="h-8 w-8 text-faint" strokeWidth={1.5} />
        <p className="mt-3 font-medium">Document not found</p>
        <p className="mt-1 text-sm text-muted">It may have been deleted or was created in a different browser.</p>
        <Link href="/documents" className="btn-primary mt-5 rounded-full">
          Back to Documents
        </Link>
      </div>
    );
  }

  return <Editor key={doc.id} doc={doc} />;
}

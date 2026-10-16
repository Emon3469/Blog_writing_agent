"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, FileText, Lightbulb, PenLine, Sparkles } from "lucide-react";
import { Brand, SectionTitle } from "@/components/ui/PageHeader";
import { postJSON } from "@/lib/api";
import { cacheSuggestions, markSuggestionDone, useLibrary, type Doc, type SuggestionItem } from "@/lib/store";
import { analyze, stripMarkdown } from "@/lib/text";

const ICONS = [FileText, PenLine, Lightbulb, Sparkles];

const STARTER: SuggestionItem[] = [
  { title: "Generate your first blog post", detail: "Open Blog Studio, describe a topic and watch the agent research, outline and write it live.", kind: "engagement" },
  { title: "Import an existing draft", detail: "Upload a Markdown or text file to get readability analytics and tailored editing suggestions.", kind: "structure" },
];

function localSuggestions(doc: Doc): SuggestionItem[] {
  const out: SuggestionItem[] = [];
  const text = stripMarkdown(doc.content);
  const stats = analyze(doc.content);
  const sentences = text.split(/(?<=[.!?])\s+/);
  const long = sentences.filter((s) => s.split(/\s+/).length > 30).length;
  const intro = doc.content.split(/\n##\s/)[0] ?? "";

  if (analyze(intro).words < 60) out.push({ title: "Enhance your document's introduction", detail: "Open with a concrete hook or problem statement so readers know why the post matters to them.", kind: "structure" });
  if (long > 2) out.push({ title: "Eliminate redundant sentences", detail: `${long} sentences run longer than 30 words. Split or trim them to keep the pace brisk.`, kind: "clarity" });
  if (stats.readability < 45) out.push({ title: "Simplify dense passages", detail: "Readability is on the difficult side. Prefer shorter words and one idea per sentence.", kind: "style" });
  if (!/^##\s/m.test(doc.content)) out.push({ title: "Add scannable sub-headings", detail: "Break the body into sections with descriptive ## headings to help skimmers.", kind: "structure" });
  if (!/conclusion|takeaway|wrap/i.test(doc.content)) out.push({ title: "Close with clear takeaways", detail: "End with a short summary or next steps so readers leave with something actionable.", kind: "engagement" });
  return out.slice(0, 3);
}

export function SuggestionsPanel({ latest }: { latest?: Doc }) {
  const { suggestionCache, doneSuggestions } = useLibrary();
  const docKey = latest ? `${latest.id}:${latest.updatedAt}` : "starter";
  const cached = suggestionCache[docKey]?.items;
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!latest || cached || requested.current === docKey) return;
    if (stripMarkdown(latest.content).trim().length < 200) return;
    requested.current = docKey;
    const controller = new AbortController();
    const key = docKey;
    const run = async () => {
      setLoadingKey(key);
      try {
        const res = await postJSON<{ suggestions: SuggestionItem[] }>(
          "/api/suggestions",
          { text: latest.content.slice(0, 30000) },
          controller.signal,
        );
        cacheSuggestions(key, res.suggestions);
      } catch {
        if (!controller.signal.aborted) setFailedKey(key);
      } finally {
        setLoadingKey((k) => (k === key ? null : k));
      }
    };
    void run();
    return () => {
      controller.abort();
      requested.current = null;
    };
  }, [latest, cached, docKey]);

  const items = useMemo(() => {
    if (!latest) return STARTER;
    if (cached) return cached;
    if (failedKey === docKey || stripMarkdown(latest.content).trim().length < 200) return localSuggestions(latest);
    return [];
  }, [latest, cached, failedKey, docKey]);

  const visible = items.map((item) => ({ ...item, key: `${docKey}:${item.title}` })).filter((i) => !doneSuggestions.includes(i.key));
  const loading = loadingKey === docKey && !cached;

  return (
    <section className="panel p-3 md:p-4">
      <div className="px-1 pb-3 pt-1">
        <SectionTitle
          title="Suggestions"
          subtitle={
            latest ? (
              <>
                For <span className="font-medium text-ink">{latest.title}</span>
              </>
            ) : (
              <>
                Start generation with <Brand />
              </>
            )
          }
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {loading &&
          [0, 1].map((i) => (
            <div key={i} className="card p-3.5">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton mt-3 h-3 w-full" />
              <div className="skeleton mt-1.5 h-3 w-4/5" />
              <div className="skeleton mt-4 h-8 w-full rounded-xl" />
            </div>
          ))}

        {!loading &&
          visible.slice(0, 3).map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <article key={item.key} className="card animate-rise p-3.5">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-ink">
                    <Icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug">{item.title}</p>
                      <span className="chip shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                        New
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-muted" title={item.detail}>{item.detail}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {latest ? (
                    <Link href={`/documents/${latest.id}`} className="btn-outline flex-1 rounded-full py-1.5 text-xs">
                      Open draft
                    </Link>
                  ) : (
                    <Link href={i === 0 ? "/studio" : "/documents"} className="btn-outline flex-1 rounded-full py-1.5 text-xs">
                      Get started
                    </Link>
                  )}
                  <button onClick={() => markSuggestionDone(item.key)} className="btn flex-1 rounded-full bg-subtle py-1.5 text-xs text-ink hover:bg-line">
                    <CircleCheck className="h-3.5 w-3.5" />
                    Mark as Done
                  </button>
                </div>
              </article>
            );
          })}

        {!loading && visible.length === 0 && (
          <div className="card grid place-items-center px-4 py-8 text-center">
            <CircleCheck className="h-6 w-6 text-success" strokeWidth={1.75} />
            <p className="mt-2 text-sm font-medium">All suggestions handled</p>
            <p className="mt-1 text-xs text-muted">Edit or generate a document to get fresh ideas.</p>
          </div>
        )}
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import {
  ArrowRight,
  Copy,
  Download,
  FileText,
  Globe,
  Hourglass,
  Image as ImageIcon,
  PenLine,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { LivePreview } from "./LivePreview";
import { Elapsed, Progress } from "./Progress";
import { useBlogGenerator, type GenerateInput, type GenerationResult } from "./useBlogGenerator";
import { PageHeader } from "@/components/ui/PageHeader";
import { createDoc, pushNotice, usePreferences, type Doc } from "@/lib/store";
import { analyze, formatDuration } from "@/lib/text";
import { TEMPLATES, findTemplate } from "@/lib/templates";
import { cn, copyText, downloadFile, slugify } from "@/lib/utils";

const LENGTHS = [
  { id: "short", label: "Short", hint: "~800 words" },
  { id: "medium", label: "Medium", hint: "~1,500 words" },
  { id: "long", label: "Long", hint: "~2,500 words" },
] as const;

function Toggle({ checked, onChange, label, hint, icon: Icon }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; icon: typeof Globe }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition hover:bg-subtle"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-ink" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}

export function StudioView() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePreferences();
  const initialTemplate = findTemplate(params.get("template")) ?? TEMPLATES[0];

  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [templateId, setTemplateId] = useState(initialTemplate.id);
  const [tone, setTone] = useState(params.get("template") ? initialTemplate.tone : "");
  const [audience, setAudience] = useState("");
  const [length, setLength] = useState<GenerateInput["length"]>(params.get("template") ? initialTemplate.length : prefs.defaultLength);
  const [images, setImages] = useState(prefs.includeImages);
  const [research, setResearch] = useState(!!initialTemplate.research);
  const [notes, setNotes] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [savedDoc, setSavedDoc] = useState<Doc | null>(null);

  const template = findTemplate(templateId) ?? TEMPLATES[0];

  const onComplete = useCallback((res: GenerationResult, input: GenerateInput) => {
    if (!res.markdown.trim()) return;
    const doc = createDoc({
      title: res.title,
      content: res.markdown,
      topic: input.topic,
      template: TEMPLATES.find((t) => t.name === input.template)?.id,
      kind: res.blogKind,
      sources: res.sources,
      providers: res.providers,
      origin: "generated",
    });
    setSavedDoc(doc);
    pushNotice({ title: "Blog post ready", body: res.title, href: `/documents/${doc.id}` });
    toast.success("Your post is ready", {
      description: `Written in ${formatDuration(Math.max(1, Math.round(res.elapsedMs / 1000)))} and saved to Documents.`,
    });
  }, []);

  const gen = useBlogGenerator(onComplete);
  const hasOutput = gen.running || gen.plan || gen.result || gen.error;

  const pickTemplate = (id: string) => {
    const t = findTemplate(id);
    if (!t) return;
    setTemplateId(id);
    setTone(t.tone);
    setLength(t.length);
    setResearch(!!t.research);
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = topic.trim();
    if (clean.length < 3) {
      toast.error("Add a topic first", { description: "Describe what the post should be about." });
      return;
    }
    setSavedDoc(null);
    const extra = [template.notes, notes.trim()].filter(Boolean).join(" ");
    void gen.start({
      topic: clean,
      template: template.name,
      tone: tone.trim() || prefs.defaultTone || undefined,
      audience: audience.trim() || prefs.defaultAudience || undefined,
      length,
      include_images: images,
      force_research: research,
      notes: extra || undefined,
    });
    if (window.innerWidth < 1280) setTimeout(() => document.getElementById("preview")?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const finalMarkdown = gen.result?.markdown;
  const stats = finalMarkdown ? analyze(finalMarkdown) : null;

  return (
    <>
      <PageHeader
        title="Blog Studio"
        description="Describe a topic — the agent routes, researches, outlines and writes every section in parallel."
        actions={
          gen.running ? (
            <button onClick={gen.stop} className="btn-outline rounded-full py-1.5 text-xs">
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop
            </button>
          ) : hasOutput ? (
            <button
              onClick={() => {
                gen.reset();
                setSavedDoc(null);
              }}
              className="btn-outline rounded-full py-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New post
            </button>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto xl:no-scrollbar">
          <form onSubmit={submit} className="panel flex flex-col gap-4 p-4">
            <div>
              <label htmlFor="topic" className="label">
                Topic
              </label>
              <textarea
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                placeholder={template.example}
                rows={3}
                maxLength={400}
                className="input resize-none leading-relaxed"
                disabled={gen.running}
              />
              <button
                type="button"
                onClick={() => setTopic(template.example)}
                className="mt-1.5 text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
                disabled={gen.running}
              >
                Use example
              </button>
            </div>

            <div>
              <p className="label">Template</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTemplate(t.id)}
                      disabled={gen.running}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition",
                        templateId === t.id ? "border-ink bg-surface font-medium text-ink" : "border-line bg-surface text-muted hover:text-ink",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="label">Length</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-subtle p-1">
                {LENGTHS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLength(l.id)}
                    disabled={gen.running}
                    className={cn("rounded-lg py-1.5 text-xs transition", length === l.id ? "bg-surface font-medium text-ink shadow-[var(--shadow-card)]" : "text-muted hover:text-ink")}
                    title={l.hint}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Toggle checked={research} onChange={setResearch} icon={Globe} label="Deep web research" hint="Always ground the post in fresh sources" />
              <Toggle checked={images} onChange={setImages} icon={ImageIcon} label="Illustrations" hint="Add up to 3 generated diagrams" />
            </div>

            <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex items-center gap-2 text-xs font-medium text-muted hover:text-ink">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {advanced ? "Hide" : "Show"} tone & audience
            </button>
            {advanced && (
              <div className="flex animate-rise flex-col gap-3">
                <div>
                  <label htmlFor="tone" className="label">
                    Tone
                  </label>
                  <input id="tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder={prefs.defaultTone || template.tone} className="input" maxLength={80} />
                </div>
                <div>
                  <label htmlFor="audience" className="label">
                    Audience
                  </label>
                  <input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={prefs.defaultAudience || "e.g. Backend engineers new to Kubernetes"} className="input" maxLength={120} />
                </div>
                <div>
                  <label htmlFor="notes" className="label">
                    Extra instructions
                  </label>
                  <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={600} placeholder="Mention our open-source SDK, avoid jargon…" className="input resize-none" />
                </div>
              </div>
            )}

            <button type="submit" disabled={gen.running} className="btn-primary w-full rounded-xl py-2.5">
              {gen.running ? (
                <>
                  <Sparkles className="h-4 w-4 animate-pulse" />
                  Writing… <Elapsed since={gen.startedAt} running={gen.running} />
                </>
              ) : (
                <>
                  <PenLine className="h-4 w-4" />
                  Generate post
                  <kbd className="ml-1 hidden rounded border border-white/20 px-1 text-[10px] opacity-70 sm:inline dark:border-black/20">Ctrl ↵</kbd>
                </>
              )}
            </button>
          </form>

          {hasOutput && (
            <div className="card animate-rise p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Agent progress</p>
                <span className="text-xs text-muted">
                  <Elapsed since={gen.startedAt} running={gen.running} />
                </span>
              </div>
              {gen.notice && (
                <div role="status" className="mb-3 flex animate-rise items-start gap-2 rounded-xl bg-subtle px-3 py-2 text-xs text-ink-soft">
                  <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-pulse" />
                  {gen.notice}
                </div>
              )}
              <Progress stages={gen.stages} route={gen.route} sources={gen.sources} sections={gen.sections} />
            </div>
          )}
        </div>

        <div id="preview" className="min-w-0 scroll-mt-20">
          {gen.error && (
            <div className="mb-4 flex animate-rise items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <div className="flex-1">
                <p className="font-medium text-ink">{gen.error}</p>
                <p className="mt-0.5 text-xs text-muted">Your settings are kept — you can retry right away.</p>
              </div>
              <button onClick={() => submit()} className="btn-outline py-1 text-xs">
                Retry
              </button>
            </div>
          )}

          {gen.result && (
            <div className="card mb-4 flex animate-rise flex-wrap items-center gap-3 p-3 pl-4">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  <b className="font-semibold text-ink tabular-nums">{stats?.words.toLocaleString()}</b> words
                </span>
                <span>
                  <b className="font-semibold text-ink">{formatDuration(stats?.readingSeconds ?? 0)}</b> read
                </span>
                <span>
                  Readability <b className="font-semibold text-ink tabular-nums">{stats?.readability}</b>
                </span>
                <span>
                  Done in <b className="font-semibold text-ink tabular-nums">{(gen.result.elapsedMs / 1000).toFixed(1)}s</b>
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    if (await copyText(gen.result!.markdown)) toast.success("Markdown copied");
                  }}
                  className="btn-outline px-2.5 py-1.5 text-xs"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
                <button onClick={() => downloadFile(`${slugify(gen.result!.title)}.md`, gen.result!.markdown)} className="btn-outline px-2.5 py-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  .md
                </button>
                {savedDoc && (
                  <button onClick={() => router.push(`/documents/${savedDoc.id}`)} className="btn-primary px-3 py-1.5 text-xs">
                    Open editor
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <article className="card min-h-[60vh] p-5 md:p-10">
            {hasOutput && !(gen.error && !gen.plan) ? (
              <LivePreview plan={gen.plan} sections={gen.sections} finalMarkdown={finalMarkdown} running={gen.running} />
            ) : (
              <EmptyState onPick={(t) => setTopic(t)} />
            )}
          </article>
        </div>
      </div>
    </>
  );
}

function EmptyState({ onPick }: { onPick: (topic: string) => void }) {
  const ideas = [
    "A practical guide to prompt caching for LLM apps",
    "This week in AI: what changed for developers",
    "Kafka vs RabbitMQ for event-driven microservices",
    "How we cut our Docker image size by 80%",
  ];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink text-canvas">
        <FileText className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight">Your post will appear here</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">
        Watch every section stream in live. Finished posts are saved automatically to your{" "}
        <Link href="/documents" className="font-medium text-ink underline-offset-4 hover:underline">
          Documents
        </Link>
        .
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        {ideas.map((idea) => (
          <button
            key={idea}
            onClick={() => onPick(idea)}
            className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm text-ink-soft transition hover:border-line-strong hover:text-ink"
          >
            <span className="truncate">{idea}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
          </button>
        ))}
      </div>
    </div>
  );
}

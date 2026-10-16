"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  Expand,
  FilePlus2,
  Heading,
  Repeat2,
  Scissors,
  ScrollText,
  Sparkles,
  SpellCheck,
  Square,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/ui/PageHeader";
import { errorMessage, isAbort, streamText } from "@/lib/api";
import { createDoc, getDoc, updateDoc } from "@/lib/store";
import { analyze } from "@/lib/text";
import { cn, copyText } from "@/lib/utils";

const MODES = [
  { id: "improve", label: "AI Writing", detail: "Improve clarity, flow and impact", icon: Sparkles },
  { id: "rephrase", label: "Rephrase", detail: "Same meaning, fresh wording", icon: Repeat2 },
  { id: "shorten", label: "Shorten", detail: "Cut length by about half", icon: Scissors },
  { id: "fix-spelling", label: "Fix Spelling", detail: "Grammar, spelling and punctuation", icon: SpellCheck },
  { id: "expand", label: "Expand", detail: "Add depth, examples and detail", icon: Expand },
  { id: "summarize", label: "Summarize", detail: "TL;DR plus key points", icon: ScrollText },
  { id: "headline", label: "Headlines", detail: "Eight title ideas", icon: Heading },
] as const;

type ModeId = (typeof MODES)[number]["id"];

const SAMPLE =
  "Their are many reasons why developers should of started using typescript years ago, the main one being that it catch alot of bugs before they even happens in production which saves time and money for the whole team.";

export function ToolsView() {
  const params = useSearchParams();
  const router = useRouter();
  const sourceDocId = params.get("doc");
  const initialMode = (MODES.find((m) => m.id === params.get("mode"))?.id ?? "improve") as ModeId;

  const [mode, setMode] = useState<ModeId>(initialMode);
  const [input, setInput] = useState(() => (sourceDocId ? getDoc(sourceDocId)?.content ?? "" : ""));
  const [guidance, setGuidance] = useState("");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [provider, setProvider] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const active = MODES.find((m) => m.id === mode)!;
  const inStats = analyze(input);
  const outStats = analyze(output);

  const run = async () => {
    if (!input.trim()) {
      toast.error("Paste some text first");
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setOutput("");
    setProvider("");
    setRunning(true);
    let frame = 0;
    let latest = "";
    try {
      const res = await streamText(
        `/api/tools/${mode}`,
        { text: input.slice(0, 20000), instructions: guidance.trim() || undefined },
        (_, full) => {
          latest = full;
          setNotice(null);
          if (!frame)
            frame = requestAnimationFrame(() => {
              frame = 0;
              setOutput(latest);
            });
        },
        controller.signal,
        setNotice,
      );
      if (frame) cancelAnimationFrame(frame);
      setOutput(res.text);
      setProvider(res.provider);
    } catch (err) {
      if (frame) cancelAnimationFrame(frame);
      setOutput(latest);
      if (!isAbort(err)) toast.error(errorMessage(err));
    } finally {
      setNotice(null);
      setRunning(false);
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const saveAsDoc = () => {
    const doc = createDoc({ title: `${active.label}: ${output.replace(/[#*_>`]/g, "").trim().slice(0, 60)}`, content: output, origin: "manual" });
    toast.success("Saved to Documents");
    router.push(`/documents/${doc.id}`);
  };

  const applyToDoc = () => {
    if (!sourceDocId) return;
    updateDoc(sourceDocId, { content: output });
    toast.success("Document updated");
    router.push(`/documents/${sourceDocId}`);
  };

  return (
    <>
      <PageHeader title="Rewrite Tools" description="Polish any passage with one click. Results stream in as they are written." />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition",
              mode === id ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card flex min-h-[460px] flex-col">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-medium">Your text</p>
            <button onClick={() => setInput(SAMPLE)} className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">
              Try a sample
            </button>
          </header>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste a paragraph, a section or a whole draft…"
            maxLength={20000}
            className="min-h-[260px] flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed outline-none placeholder:text-faint"
          />
          <div className="border-t border-line p-3">
            <input
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              maxLength={400}
              placeholder="Optional guidance, e.g. “keep it friendly, UK spelling”"
              className="input mb-3 py-2 text-xs"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted tabular-nums">
                {inStats.words} words · {input.length.toLocaleString()}/20,000
              </span>
              {running ? (
                <button onClick={() => controllerRef.current?.abort()} className="btn-outline">
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button onClick={run} disabled={!input.trim()} className="btn-primary">
                  <Wand2 className="h-4 w-4" />
                  {active.label}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="card flex min-h-[460px] flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Result</p>
              <p className="truncate text-xs text-muted">{active.detail}</p>
            </div>
            {output && !running && (
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={async () => {
                    if (await copyText(output)) {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }
                  }}
                  className="btn-ghost p-2"
                  aria-label="Copy result"
                  title="Copy"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <button onClick={() => setInput(output)} className="btn-ghost p-2" aria-label="Use result as input" title="Use as input">
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
                <button onClick={saveAsDoc} className="btn-ghost p-2" aria-label="Save as document" title="Save as document">
                  <FilePlus2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </header>
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            {output ? (
              <div className={cn(running && "[&_.prose-draft>*:last-child]:caret")}>
                <Markdown content={output} className="prose-sm" />
              </div>
            ) : running ? (
              <div className="space-y-2" role="status" aria-label="Generating">
                {notice && <p className="pb-1 text-xs text-muted">{notice}</p>}
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-5/6" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <active.icon className="mx-auto h-8 w-8 text-faint" strokeWidth={1.5} />
                  <p className="mt-3 text-sm text-muted">Your rewritten text will stream in here.</p>
                </div>
              </div>
            )}
          </div>
          {output && !running && (
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-xs text-muted">
              <span className="tabular-nums">
                {outStats.words} words
                {inStats.words > 0 && (
                  <>
                    {" "}
                    · {outStats.words >= inStats.words ? "+" : ""}
                    {Math.round(((outStats.words - inStats.words) / inStats.words) * 100)}% · readability {outStats.readability}
                  </>
                )}
                {provider && <span className="capitalize"> · via {provider}</span>}
              </span>
              {sourceDocId && (
                <button onClick={applyToDoc} className="btn-primary px-3 py-1.5 text-xs">
                  Apply to document
                </button>
              )}
            </footer>
          )}
        </section>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, CircleDot, ExternalLink, Globe, LoaderCircle, Minus, X } from "lucide-react";
import type { SectionState, StageId, StageStatus } from "./useBlogGenerator";
import type { Source } from "@/lib/store";
import { cn } from "@/lib/utils";

const STAGES: { id: StageId; label: string }[] = [
  { id: "router", label: "Analyse topic" },
  { id: "research", label: "Web research" },
  { id: "plan", label: "Outline" },
  { id: "writing", label: "Write sections" },
  { id: "images", label: "Illustrations" },
  { id: "done", label: "Assemble post" },
];

const MODE_LABEL: Record<string, string> = {
  closed_book: "Evergreen",
  hybrid: "Hybrid · fresh examples",
  open_book: "Live news",
};

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === "active") return <LoaderCircle className="h-3.5 w-3.5 animate-spin" />;
  if (status === "done") return <Check className="h-3.5 w-3.5" strokeWidth={2.5} />;
  if (status === "skipped") return <Minus className="h-3.5 w-3.5" />;
  if (status === "error") return <X className="h-3.5 w-3.5" strokeWidth={2.5} />;
  return <CircleDot className="h-3 w-3 opacity-40" />;
}

export function Elapsed({ since, running }: { since: number | null; running: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);
  if (!since) return null;
  return <span className="tabular-nums">{((now - since) / 1000).toFixed(1)}s</span>;
}

export function Progress({
  stages,
  route,
  sources,
  sections,
}: {
  stages: Record<StageId, StageStatus>;
  route: { mode: string; reason: string; queries: string[] } | null;
  sources: Source[];
  sections: SectionState[];
}) {
  const done = sections.filter((s) => s.status === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col">
        {STAGES.map((stage, i) => {
          const status = stages[stage.id];
          return (
            <li key={stage.id} className="relative flex gap-3 pb-4 last:pb-0">
              {i < STAGES.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-20px)] w-px bg-line" />}
              <span
                className={cn(
                  "relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
                  status === "done" && "border-ink bg-ink text-canvas",
                  status === "active" && "border-ink bg-surface text-ink",
                  status === "error" && "border-danger bg-danger text-white",
                  (status === "idle" || status === "skipped") && "border-line bg-surface text-faint",
                )}
              >
                <StatusIcon status={status} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={cn("text-sm", status === "idle" || status === "skipped" ? "text-faint" : "font-medium text-ink")}>
                  {stage.label}
                  {stage.id === "writing" && sections.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted tabular-nums">
                      {done}/{sections.length}
                    </span>
                  )}
                  {status === "skipped" && <span className="ml-2 text-xs font-normal">skipped</span>}
                </p>
                {stage.id === "router" && route && (
                  <div className="mt-1.5 animate-rise">
                    <span className="chip">{MODE_LABEL[route.mode] ?? route.mode}</span>
                    {route.reason && <p className="mt-1.5 text-xs leading-relaxed text-muted">{route.reason}</p>}
                  </div>
                )}
                {stage.id === "research" && route?.queries?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {route.queries.slice(0, 4).map((q) => (
                      <span key={q} className="chip max-w-full truncate">
                        <Globe className="h-3 w-3 shrink-0" />
                        <span className="truncate">{q}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
                {stage.id === "research" && sources.length > 0 && (
                  <p className="mt-1.5 text-xs text-muted">{sources.length} sources collected</p>
                )}
                {stage.id === "writing" && sections.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {sections.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 text-xs">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            s.status === "done" ? "bg-ink" : s.status === "writing" ? "animate-pulse bg-warning" : "bg-line-strong",
                          )}
                        />
                        <span className={cn("truncate", s.status === "pending" ? "text-faint" : "text-ink-soft")}>{s.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {sources.length > 0 && (
        <div className="border-t border-line pt-4">
          <p className="label">Sources</p>
          <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto pr-1 scrollbar-thin">
            {sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded-lg p-1.5 text-xs transition hover:bg-subtle"
                >
                  <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-faint group-hover:text-ink" />
                  <span className="min-w-0">
                    <span className="line-clamp-1 font-medium text-ink-soft">{s.title}</span>
                    <span className="text-faint">
                      {s.source}
                      {s.published_at ? ` · ${s.published_at}` : ""}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

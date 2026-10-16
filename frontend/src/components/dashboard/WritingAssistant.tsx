"use client";

import Link from "next/link";
import { BookOpen, PenLine } from "lucide-react";
import { Brand, SectionTitle } from "@/components/ui/PageHeader";
import type { DocMetrics } from "@/lib/store";
import { findTemplate } from "@/lib/templates";
import { formatStamp } from "@/lib/utils";

function ScoreBadge({ value }: { value: number | null }) {
  const pct = value ?? 0;
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid h-9 w-9 place-items-center" title="Average readability score">
      <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2" className="stroke-line" />
        {pct > 0 && (
          <circle
            cx="12"
            cy="12"
            r={r}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * c} ${c}`}
            className="stroke-ink transition-all duration-700"
          />
        )}
      </svg>
      <span className="text-[10px] font-semibold text-ink">{value ?? "—"}</span>
    </span>
  );
}

function TemplateTile({
  id,
  icon: Icon,
  metrics,
}: {
  id: string;
  icon: typeof PenLine;
  metrics: DocMetrics[];
}) {
  const template = findTemplate(id)!;
  const used = metrics.filter((m) => m.doc.template === id);
  const latest = used[0]?.doc;
  const score = used.length ? Math.round(used.reduce((s, m) => s + m.readability, 0) / used.length) : null;

  return (
    <Link
      href={`/studio?template=${id}`}
      className="group card flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5"
    >
      <div className="flex-1 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-canvas">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="text-lg font-semibold tracking-tight">{template.name}</span>
          </div>
          <ScoreBadge value={score} />
        </div>
        <p className="mt-5 text-sm font-medium text-ink-soft">Readability score</p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">{template.description}</p>
      </div>
      <div className="border-t border-line bg-subtle/60 px-4 py-2.5 text-center text-xs text-muted transition group-hover:text-ink">
        {latest ? `Last update: ${formatStamp(latest.updatedAt)}` : "Not used yet · Start writing"}
      </div>
    </Link>
  );
}

export function WritingAssistant({ metrics }: { metrics: DocMetrics[] }) {
  return (
    <section className="panel p-3 md:p-4">
      <div className="px-1 pb-4 pt-1">
        <SectionTitle
          title="Writing Assistant"
          subtitle={
            <>
              Start generation with <Brand />
            </>
          }
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TemplateTile id="blog-post" icon={PenLine} metrics={metrics} />
        <TemplateTile id="essay" icon={BookOpen} metrics={metrics} />
      </div>
    </section>
  );
}

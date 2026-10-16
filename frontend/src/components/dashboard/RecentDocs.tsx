"use client";

import Link from "next/link";
import { FilePlus2, FolderOpen } from "lucide-react";
import type { DocMetrics } from "@/lib/store";
import { formatShortDate } from "@/lib/utils";

const TARGET_WORDS = 1200;

export function RecentDocs({ metrics }: { metrics: DocMetrics[] }) {
  const recent = metrics.slice(0, 2);

  return (
    <section className="panel grid gap-4 p-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] md:p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">Recent Documents</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">Quickly access your most recently created or edited documents.</p>
        <Link href="/documents" className="mt-3 inline-block text-xs font-medium text-ink underline-offset-4 hover:underline">
          View all
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {recent.map(({ doc, words }) => {
          const pct = doc.status === "published" ? 100 : Math.min(100, Math.round((words / TARGET_WORDS) * 100));
          return (
            <Link key={doc.id} href={`/documents/${doc.id}`} className="card block p-3.5 transition hover:-translate-y-0.5">
              <div className="flex items-start gap-2">
                <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.75} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <p className="text-[11px] text-faint">Last modified on {formatShortDate(doc.updatedAt)}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="font-semibold tabular-nums">{pct}%</span>
                <span className="capitalize text-faint">{doc.status}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-ink transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        })}
        {recent.length < 2 && (
          <Link
            href="/studio"
            className="grid min-h-[112px] place-items-center rounded-2xl border border-dashed border-line-strong p-4 text-center text-sm text-muted transition hover:border-ink hover:text-ink"
          >
            <span className="flex flex-col items-center gap-2">
              <FilePlus2 className="h-5 w-5" strokeWidth={1.75} />
              Create a new document
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}

"use client";

import { BookOpen, Clock, Type } from "lucide-react";
import type { DocMetrics } from "@/lib/store";
import { gradeLabel } from "@/lib/text";
import { compactNumber } from "@/lib/utils";

export function StatsRow({ metrics }: { metrics: DocMetrics[] }) {
  const n = metrics.length;
  const avg = (pick: (m: DocMetrics) => number) => (n ? Math.round(metrics.reduce((s, m) => s + pick(m), 0) / n) : 0);
  const readability = avg((m) => m.readability);

  const stats = [
    { label: "Avg. Readability", unit: n ? gradeLabel(readability) : "Flesch score", value: readability, icon: BookOpen },
    { label: "Avg. Reading Time", unit: "Secs", value: avg((m) => m.readingSeconds), icon: Clock },
    { label: "Avg. Word Count", unit: "Words", value: avg((m) => m.words), icon: Type },
  ];

  return (
    <section className="card grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {stats.map(({ label, unit, value, icon: Icon }) => (
        <div key={label} className="p-4 md:px-5">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted" strokeWidth={1.75} />
            <p className="text-[15px] font-medium tracking-tight text-ink">{label}</p>
          </div>
          <p className="mt-2 text-xs text-muted">{unit}</p>
          <p className="mt-1.5 text-[26px] font-semibold tabular-nums tracking-tight text-ink">{compactNumber(value)}</p>
        </div>
      ))}
    </section>
  );
}

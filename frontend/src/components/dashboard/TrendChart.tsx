"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Download, EllipsisVertical, Filter, RefreshCw } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { SectionTitle } from "@/components/ui/PageHeader";
import type { DocMetrics } from "@/lib/store";
import { cn, downloadFile } from "@/lib/utils";

type Metric = "words" | "readability" | "documents";
const METRICS: { id: Metric; label: string }[] = [
  { id: "words", label: "Words written" },
  { id: "readability", label: "Avg. readability" },
  { id: "documents", label: "Documents" },
];
const RANGES = [7, 14, 30];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TrendChart({ metrics }: { metrics: DocMetrics[] }) {
  const [metric, setMetric] = useState<Metric>("words");
  const [range, setRange] = useState(7);
  const [tick, setTick] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const data = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: range }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (range - 1 - i));
      return d;
    });
    const buckets = new Map(days.map((d) => [dayKey(d), [] as DocMetrics[]]));
    for (const m of metrics) {
      const bucket = buckets.get(dayKey(new Date(m.doc.updatedAt)));
      if (bucket) bucket.push(m);
    }
    return days.map((d) => {
      const items = buckets.get(dayKey(d)) ?? [];
      const value =
        metric === "words"
          ? items.reduce((s, m) => s + m.words, 0)
          : metric === "documents"
            ? items.length
            : items.length
              ? Math.round(items.reduce((s, m) => s + m.readability, 0) / items.length)
              : 0;
      return {
        label: range <= 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        value,
        date: dayKey(d),
      };
    });
  }, [metrics, metric, range]);

  const empty = data.every((d) => d.value === 0);
  const label = METRICS.find((m) => m.id === metric)!.label;

  const refresh = () => {
    setSpinning(true);
    setTick((t) => t + 1);
    setTimeout(() => setSpinning(false), 700);
  };

  const exportCsv = () => {
    const csv = ["date,value", ...data.map((d) => `${d.date},${d.value}`)].join("\n");
    downloadFile(`writing-trend-${metric}-${range}d.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <section className="card p-4 md:p-5">
      <SectionTitle
        title="Writing Trend Analytics"
        subtitle={`Track ${label.toLowerCase()} with real-time analytics · last ${range} days`}
        actions={
          <>
            <Popover
              className="w-52"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="btn-outline px-2.5 py-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Filters</span>
                </button>
              )}
            >
              {(close) => (
                <div className="text-sm">
                  <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">Metric</p>
                  {METRICS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMetric(m.id);
                        close();
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-subtle"
                    >
                      {m.label}
                      {metric === m.id && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                  <p className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-faint">Range</p>
                  <div className="flex gap-1 px-1.5 pb-1">
                    {RANGES.map((r) => (
                      <button
                        key={r}
                        onClick={() => setRange(r)}
                        className={cn("flex-1 rounded-lg py-1 text-xs", range === r ? "bg-ink text-canvas" : "bg-subtle text-muted hover:text-ink")}
                      >
                        {r}d
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Popover>
            <button onClick={refresh} className="btn-outline px-2.5 py-1.5 text-xs">
              <RefreshCw className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Popover
              className="w-44"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="btn-ghost p-1.5" aria-label="More options">
                  <EllipsisVertical className="h-4 w-4" />
                </button>
              )}
            >
              {(close) => (
                <button
                  onClick={() => {
                    exportCsv();
                    close();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-subtle"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              )}
            </Popover>
          </>
        }
      />

      <div className="relative mt-4 h-[210px] w-full">
        <ResponsiveContainer key={tick} width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-stroke)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-stroke)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted)", fontSize: 12 }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} allowDecimals={false} width={48} />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)" }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--ink)",
              }}
              labelStyle={{ color: "var(--muted)" }}
              formatter={(v) => [v, label]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--ink)"
              strokeOpacity={0.55}
              strokeWidth={1.75}
              fill="url(#trendFill)"
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
        {empty && (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">
            No activity in this range yet — your writing will show up here.
          </p>
        )}
      </div>
    </section>
  );
}

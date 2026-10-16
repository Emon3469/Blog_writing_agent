import Link from "next/link";
import { ChevronRight, Repeat2, Scissors, Sparkles, SpellCheck } from "lucide-react";
import { Brand, SectionTitle } from "@/components/ui/PageHeader";

const TOOLS = [
  { mode: "improve", title: "AI Writing Tools", detail: "Sharpen clarity, flow and impact", icon: Sparkles },
  { mode: "rephrase", title: "Rephrase Text", detail: "Rewrite sentences in a fresh style", icon: Repeat2 },
  { mode: "shorten", title: "Shorten Text", detail: "Summarize your writing by ~50%", icon: Scissors },
  { mode: "fix-spelling", title: "Fix Spelling", detail: "Correct writing errors instantly", icon: SpellCheck },
];

export function ToolsPanel() {
  return (
    <section className="panel p-3 md:p-4">
      <div className="px-1 pb-3 pt-1">
        <SectionTitle
          title="Tools"
          subtitle={
            <>
              Start generation with <Brand />
            </>
          }
        />
      </div>
      <div className="flex flex-col gap-2.5">
        {TOOLS.map(({ mode, title, detail, icon: Icon }) => (
          <Link
            key={mode}
            href={`/tools?mode=${mode}`}
            className="group card flex items-center gap-3 p-3 transition hover:-translate-y-0.5"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-subtle text-ink">
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{title}</span>
              <span className="block truncate text-xs text-muted">{detail}</span>
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink transition group-hover:bg-ink group-hover:text-canvas">
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

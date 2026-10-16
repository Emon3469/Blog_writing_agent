import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { TEMPLATES } from "@/lib/templates";

export const metadata: Metadata = { title: "Templates" };

const LENGTH_LABEL = { short: "~800 words", medium: "~1,500 words", long: "~2,500 words" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader title="Templates" description="Pick a format and the agent adapts its structure, tone and research strategy." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.id}
              href={`/studio?template=${t.id}`}
              className="group card flex flex-col p-4 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-ink text-canvas">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                {t.research && (
                  <span className="chip">
                    <Globe className="h-3 w-3" />
                    Live research
                  </span>
                )}
              </div>
              <h2 className="mt-4 font-semibold tracking-tight">{t.name}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.description}</p>
              <p className="mt-3 line-clamp-2 rounded-xl bg-subtle px-3 py-2 text-xs italic text-ink-soft">&ldquo;{t.example}&rdquo;</p>
              <div className="mt-auto flex items-center justify-between pt-4 text-xs text-faint">
                <span>{LENGTH_LABEL[t.length]}</span>
                <span className="flex items-center gap-1 font-medium text-ink opacity-0 transition group-hover:opacity-100">
                  Use template
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

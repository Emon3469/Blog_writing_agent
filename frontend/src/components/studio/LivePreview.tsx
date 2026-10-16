"use client";

import { memo, useEffect, useRef } from "react";
import { Markdown } from "@/components/Markdown";
import type { PlanInfo, SectionState } from "./useBlogGenerator";
import { cn } from "@/lib/utils";

const SectionBlock = memo(function SectionBlock({ section }: { section: SectionState }) {
  if (section.status === "pending" || (!section.content && section.status === "writing")) {
    return (
      <div className="my-8">
        <h2 className="text-xl font-semibold tracking-tight text-faint">{section.title}</h2>
        <div className="mt-4 space-y-2">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-11/12" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      </div>
    );
  }
  return (
    <div className={cn(section.status === "writing" && "[&_.prose-draft>*:last-child]:caret")}>
      <Markdown content={section.content} />
    </div>
  );
});

export function LivePreview({
  plan,
  sections,
  finalMarkdown,
  running,
}: {
  plan: PlanInfo | null;
  sections: SectionState[];
  finalMarkdown?: string;
  running: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  useEffect(() => {
    const onScroll = () => {
      const distance = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      follow.current = distance < 240;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const lastWriting = [...sections].reverse().find((s) => s.status === "writing")?.id;
  const totalChars = sections.reduce((n, s) => n + s.content.length, 0);

  useEffect(() => {
    if (running && follow.current && lastWriting === sections[sections.length - 1]?.id) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [totalChars, running, lastWriting, sections]);

  if (finalMarkdown) {
    return <Markdown content={finalMarkdown} className="animate-rise" />;
  }

  return (
    <div>
      {plan ? (
        <h1 className="animate-rise text-3xl font-semibold tracking-tight text-ink">{plan.blog_title}</h1>
      ) : (
        <div className="skeleton h-9 w-3/4" />
      )}
      {plan && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip capitalize">{plan.blog_kind.replace("_", " ")}</span>
          <span className="chip">{plan.audience}</span>
          <span className="chip">{plan.tone}</span>
        </div>
      )}
      {sections.length === 0 && (
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-3" style={{ width: `${92 - i * 9}%` }} />
          ))}
        </div>
      )}
      {sections.map((s) => (
        <SectionBlock key={s.id} section={s} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
